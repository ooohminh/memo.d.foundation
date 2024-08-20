defmodule Memo.ExportMarkdown do
  @moduledoc """
  A module to export Obsidian markdown files and assets folders to standard markdown.
  """

  use Flow

  def run(vaultpath, exportpath) do
    System.put_env("LC_ALL", "en_US.UTF-8")
    System.cmd("locale", [])

    vaultpath = vaultpath || "vault"
    exportpath = exportpath || "content"

    {vault_dir, mode} =
      if File.dir?(vaultpath) do
        {vaultpath, :directory}
      else
        {Path.dirname(vaultpath), :file}
      end

    ignored_patterns = read_export_ignore_file(Path.join(vault_dir, ".export-ignore"))

    paths = list_files_and_assets_recursive(vault_dir)
    {all_files, all_assets} = Enum.split_with(paths, &File.regular?/1)

    all_valid_files =
      all_files
      |> Enum.filter(&(not ignored?(&1, ignored_patterns, vault_dir)))

    if mode == :file do
      process_single_file(vaultpath, vault_dir, exportpath, all_valid_files)
    else
      process_directory(all_valid_files, all_assets, vault_dir, exportpath)
    end
  end

  defp process_single_file(vaultpath, vault_dir, exportpath, all_valid_files) do
    normalized_vaultpath = normalize_path(vaultpath)

    if Enum.member?(all_valid_files, normalized_vaultpath) and
         contains_required_frontmatter_keys?(normalized_vaultpath) do
      process_file(normalized_vaultpath, vault_dir, exportpath, all_valid_files)
    else
      IO.puts(
        "File #{inspect(vaultpath)} does not exist, is ignored, or does not contain required frontmatter keys."
      )
    end
  end

  defp process_directory(all_valid_files, all_assets, vault_dir, exportpath) do
    Flow.from_enumerable(all_valid_files)
    |> Flow.filter(&contains_required_frontmatter_keys?/1)
    |> Flow.map(&process_file(&1, vault_dir, exportpath, all_valid_files))
    |> Flow.run()

    Flow.from_enumerable(all_assets)
    |> Flow.map(&export_assets_folder(&1, vault_dir, exportpath))
    |> Flow.run()

    # Export the db directory
    export_db_directory("db", exportpath)
  end

  defp list_files_and_assets_recursive(path) do
    File.ls!(path)
    |> Enum.flat_map(fn file ->
      normalized_file = normalize_path(file)
      full_path = Path.join(path, normalized_file)

      if File.dir?(full_path),
        do: [full_path | list_files_and_assets_recursive(full_path)],
        else: [full_path]
    end)
  end

  defp export_assets_folder(asset_path, vaultpath, exportpath) do
    if Path.basename(asset_path) == "assets" do
      target_path = replace_path_prefix(asset_path, vaultpath, exportpath)
      copy_directory(asset_path, target_path)
      IO.puts("Exported assets: #{asset_path} -> #{target_path}")
    end
  end

  defp export_db_directory(dbpath, exportpath) do
    if File.dir?(dbpath) do
      export_db_path = Path.join(exportpath, "db")
      copy_directory(dbpath, export_db_path)
      IO.puts("Exported db folder: #{dbpath} -> #{export_db_path}")
    else
      IO.puts("db folder not found at #{dbpath}")
    end
  end

  defp copy_directory(source, destination) do
    lowercase_destination = String.downcase(destination)
    File.mkdir_p!(lowercase_destination)

    File.ls!(source)
    |> Enum.each(fn item ->
      source_path = Path.join(source, item)
      dest_path = Path.join(lowercase_destination, String.downcase(item))

      if File.dir?(source_path) do
        copy_directory(source_path, dest_path)
      else
        File.copy!(source_path, dest_path)
      end
    end)
  end

  defp read_export_ignore_file(ignore_file) do
    if File.exists?(ignore_file) do
      File.read!(ignore_file)
      |> String.split("\n", trim: true)
      |> Enum.reject(&(String.starts_with?(&1, "#") or &1 == ""))
    else
      []
    end
  end

  defp ignored?(file, patterns, vaultpath) do
    relative_path = Path.relative_to(file, vaultpath)
    normalized_path = normalize_path(relative_path)
    Enum.any?(patterns, &match_pattern?(normalized_path, &1))
  end

  defp normalize_path(path) do
    path
    |> String.replace("Â§", "§")
    |> String.to_charlist()
    |> Enum.map(fn
      c when c < 128 -> c
      c -> c
    end)
    |> List.to_string()
  end

  defp match_pattern?(path, pattern) do
    cond do
      String.ends_with?(pattern, "/") ->
        String.starts_with?(path, pattern) or String.contains?(path, "/#{pattern}")

      String.starts_with?(pattern, "*") ->
        String.ends_with?(path, String.trim_leading(pattern, "*"))

      String.ends_with?(pattern, "*") ->
        String.starts_with?(path, String.trim_trailing(pattern, "*"))

      true ->
        path == pattern or String.contains?(path, pattern)
    end
  end

  defp contains_required_frontmatter_keys?(file) do
    with {:ok, content} <- File.read(file),
         {:ok, frontmatter} <- parse_frontmatter(content) do
      Map.has_key?(frontmatter, "title") and Map.has_key?(frontmatter, "description")
    else
      _ -> false
    end
  end

  defp parse_frontmatter(content) do
    with [frontmatter_str] <- Regex.run(~r/^---\n(.*?)\n---/s, content, capture: :all_but_first) do
      frontmatter_str
      |> String.split("\n")
      |> Enum.map(&String.split(&1, ": ", parts: 2))
      |> Enum.filter(&match?([_, _], &1))
      |> Enum.into(%{}, fn [key, value] -> {key, String.trim(value)} end)
      |> (&{:ok, &1}).()
    else
      _ -> :error
    end
  end

  defp process_file(file, vaultpath, exportpath, all_files) do
    content = File.read!(file)
    links = extract_links(content)
    resolved_links = resolve_links(links, all_files, vaultpath)
    converted_content = convert_links(content, resolved_links)
    converted_content = process_duckdb_queries(converted_content)

    export_file = replace_path_prefix(file, vaultpath, exportpath)
    lowercase_export_file = String.downcase(export_file)
    export_dir = Path.dirname(lowercase_export_file)
    File.mkdir_p!(export_dir)

    File.write!(lowercase_export_file, converted_content)
    IO.puts("Exported: #{inspect(file)} -> #{inspect(lowercase_export_file)}")
  end

  defp process_duckdb_queries(content) do
    content
    |> process_dsql_tables()
    |> process_dsql_lists()
  end

  defp process_dsql_tables(content) do
    Regex.replace(~r/```dsql-table\n(.*?)```/s, content, fn _, query ->
      case execute_duckdb_query(query) do
        {:ok, result} -> result_to_markdown_table(result, query)
        {:error, error} -> "Error executing query: #{error}"
      end
    end)
  end

  defp process_dsql_lists(content) do
    Regex.replace(~r/```dsql-list\n(.*?)```/s, content, fn _, query ->
      case execute_duckdb_query(query) do
        {:ok, result} -> result_to_markdown_list(result, query)
        {:error, error} -> "Error executing query: #{error}"
      end
    end)
  end

  defp execute_duckdb_query(query) do
    duckdb_cmd(query)
  end

  defp duckdb_cmd(query) do
    {result, exit_code} =
      System.cmd("duckdb", [
        "-json",
        "-cmd",
        "IMPORT DATABASE 'db'",
        "-cmd",
        "CREATE OR REPLACE TEMP MACRO markdown_link(title, file_path) AS '[' || COALESCE(title, '/' || REGEXP_REPLACE(LOWER(REGEXP_REPLACE(REPLACE(REPLACE(file_path, '.md', ''), ' ', '-'),'[^a-zA-Z0-9/_-]+', '-')), '(^-|-$)', '')) || '](/' || REGEXP_REPLACE(LOWER(REGEXP_REPLACE(REPLACE(REPLACE(file_path, '.md', ''), ' ', '-'),'[^a-zA-Z0-9/_-]+', '-')), '(^-|-$)', '') || ')'",
        "-c",
        query
      ])

    cond do
      exit_code != 0 ->
        {:error, result}

      result == "" ->
        {:ok, []}

      true ->
        case Jason.decode(result) do
          {:ok, json} -> {:ok, json}
          {:error, _} -> {:ok, result}
        end
    end
  end

  defp result_to_markdown_table(result, query) when is_list(result) and length(result) > 0 do
    headers = extract_headers_from_query(query)

    available_headers =
      case result do
        [%{} | _] -> Map.keys(hd(result))
        _ -> []
      end

    # Use headers from query if available, otherwise use all available headers
    headers =
      if Enum.empty?(headers),
        do: available_headers,
        else: Enum.filter(headers, &(&1 in available_headers))

    # If headers are still empty, use the keys from the first result item
    headers = if Enum.empty?(headers), do: Map.keys(hd(result)), else: headers

    if Enum.empty?(headers) do
      "No headers found in the result."
    else
      header_row = "| #{Enum.join(headers, " | ")} |"
      separator_row = "|#{String.duplicate("---|", length(headers))}"

      rows =
        Enum.map(result, fn row ->
          "| #{Enum.map(headers, &(get_value(row, &1) |> to_string |> String.trim())) |> Enum.join(" | ")} |"
        end)

      [header_row, separator_row | rows]
      |> Enum.join("\n")
    end
  end

  defp result_to_markdown_table(result, _) when is_binary(result), do: result
  defp result_to_markdown_table(_, _), do: "No results or invalid data format."

  defp result_to_markdown_list(result, query) when is_list(result) and length(result) > 0 do
    headers = extract_headers_from_query(query)

    available_headers =
      case result do
        [%{} | _] -> Map.keys(hd(result))
        _ -> []
      end

    headers =
      if Enum.empty?(headers),
        do: available_headers,
        else: Enum.filter(headers, &(&1 in available_headers))

    Enum.map(result, fn row ->
      value =
        if Enum.empty?(headers) do
          format_item(row)
        else
          headers
          |> Enum.map(&get_value(row, &1))
          |> Enum.map(&format_item/1)
          |> Enum.join(": ")
        end

      "- #{value}"
    end)
    |> Enum.join("\n")
  end

  defp result_to_markdown_list(result, _) when is_binary(result), do: "- #{result}"
  defp result_to_markdown_list(_, _), do: "No results or invalid data format."

  defp get_value(row, key) when is_map(row) do
    cond do
      Map.has_key?(row, key) -> row[key]
      Map.has_key?(row, String.downcase(key)) -> row[String.downcase(key)]
      Map.has_key?(row, String.upcase(key)) -> row[String.upcase(key)]
      true -> nil
    end
  end

  defp get_value(row, _key), do: row

  defp format_item(item) when is_binary(item), do: String.trim(item)

  defp format_item(item) when is_map(item) do
    case Map.values(item) do
      [single_value] -> format_item(single_value)
      _ -> Enum.map_join(item, ", ", fn {k, v} -> "#{k}: #{v}" end)
    end
  end

  defp format_item(item), do: to_string(item)

  defp extract_headers_from_query(query) do
    case Regex.run(~r/SELECT\s+(.+?)\s+FROM/is, query) do
      [_, columns] ->
        columns
        |> String.split(",")
        |> Enum.map(&extract_column_name/1)
        |> Enum.filter(&(&1 != nil))

      nil ->
        []
    end
  end

  defp extract_column_name(column) do
    column = String.trim(column)

    cond do
      # Case: column AS 'alias with spaces'
      String.match?(column, ~r/\sAS\s+'([^']+)'/i) ->
        Regex.run(~r/\sAS\s+'([^']+)'/i, column)
        |> List.last()
        |> clean_name()

      # Case: column AS "alias with spaces"
      String.match?(column, ~r/\sAS\s+"([^"]+)"/i) ->
        Regex.run(~r/\sAS\s+"([^"]+)"/i, column)
        |> List.last()
        |> clean_name()

      # Case: column AS alias
      String.match?(column, ~r/\sAS\s/i) ->
        [_, alias] = Regex.split(~r/\sAS\s/i, column, parts: 2)
        clean_name(alias)

      # Case: function(column) alias
      String.match?(column, ~r/^[\w\d_]+\(.*\)\s+\w+$/) ->
        Regex.run(~r/^.*\)\s+(\w+)$/, column)
        |> List.last()
        |> clean_name()

      # Case: function(column) AS alias
      String.match?(column, ~r/^[\w\d_]+\(.*\)\s+AS\s+\w+$/i) ->
        Regex.run(~r/^.*\)\s+AS\s+(\w+)$/i, column)
        |> List.last()
        |> clean_name()

      # Case: just a function or column name without alias
      true ->
        clean_name(column)
    end
  end

  defp clean_name(name) do
    name
    |> String.replace(~r/["\[\]`()]/, "")
    |> String.trim()
  end

  defp replace_path_prefix(path, old_prefix, new_prefix) do
    [old_prefix, new_prefix]
    |> Enum.map(&Path.split/1)
    |> Enum.map(&List.first/1)
    |> then(fn [old, new] -> String.replace_prefix(path, old, new) end)
  end

  defp extract_links(content) do
    pattern =
      ~r/!\[\[((?:[^\]]|\.mp4|\.webp|\.png|\.jpg|\.gif|\.svg)+)\]\]|\[\[([^\|\]]+\.md)\|([^\]]+)\]\]|\[\[([^\|\]]+)\|([^\]]+)\]\]|\[\[([^\|\]]+\.md)\]\]|\[\[([^\]]+)\]\]/

    Regex.scan(pattern, content)
    |> Enum.flat_map(fn
      [_, image] when not is_nil(image) -> [image]
      [_, _, pre, _] when not is_nil(pre) -> [pre]
      [_, _, _, _, file, _] when not is_nil(file) -> [file]
      [_, _, _, _, _, mdfile] when not is_nil(mdfile) -> [mdfile]
      [_, pre] when not is_nil(pre) -> [pre]
      _ -> []
    end)
  end

  defp resolve_links(links, all_files, vaultpath) do
    links
    |> Flow.from_enumerable()
    |> Flow.flat_map(&find_link_paths(&1, all_files, vaultpath))
    |> Enum.into(%{})
  end

  defp find_link_paths(link, all_files, vaultpath) do
    downcased_link = String.downcase(link)

    for path <- all_files,
        basename = Path.basename(path),
        downcased_basename = String.downcase(basename),
        String.contains?(basename, link) or String.contains?(downcased_basename, downcased_link),
        into: %{} do
      {link, Path.relative_to(path, vaultpath) |> String.downcase()}
    end
  end

  defp convert_links(content, resolved_links) do
    sanitized_resolved_links =
      Enum.reduce(resolved_links, %{}, fn {k, v}, acc ->
        sanitized_key = String.replace(k, ~r/\\\|/, "|")
        Map.put(acc, sanitized_key, String.replace(v, ~r/\\$/, ""))
      end)

    content
    |> convert_links_with_alt_text(sanitized_resolved_links)
    |> convert_links_without_alt_text(sanitized_resolved_links)
    |> convert_embedded_images(sanitized_resolved_links)
  end

  defp convert_links_with_alt_text(content, resolved_links) do
    Regex.replace(~r/\[\[([^\|\]]+)\|([^\]]+)\]\]/, content, fn _, link, alt_text ->
      resolved_path =
        Map.get(resolved_links, link, link) |> String.replace(~r/\\$/, "") |> String.downcase()

      "[#{alt_text}](#{resolved_path})"
    end)
  end

  defp convert_links_without_alt_text(content, resolved_links) do
    Regex.replace(~r/\[\[([^\]]+)\]\]/, content, fn _, link ->
      resolved_path =
        Map.get(resolved_links, link, "#{link}.md")
        |> String.replace(~r/\\$/, "")
        |> String.downcase()

      alt_text = Path.basename(resolved_path, ".md")
      "[#{alt_text}](#{resolved_path})"
    end)
  end

  defp convert_embedded_images(content, resolved_links) do
    Regex.replace(~r/!\[\[([^\]]+)\]\]/, content, fn _, link ->
      resolved_path =
        Map.get(resolved_links, link, link) |> String.replace(~r/\\$/, "") |> String.downcase()

      "![](#{resolved_path})"
    end)
  end
end