param(
  [string]$Root = (Get-Location).Path,
  [int]$Port = 4173
)

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()

$types = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".pdf" = "application/pdf"
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $path = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))
  if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
  $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $path))
  $rootPath = [System.IO.Path]::GetFullPath($Root)
  if (-not $fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    $context.Response.StatusCode = 403
    $context.Response.Close()
    continue
  }
  if (-not [System.IO.File]::Exists($fullPath)) {
    $context.Response.StatusCode = 404
    $context.Response.Close()
    continue
  }
  $bytes = [System.IO.File]::ReadAllBytes($fullPath)
  $ext = [System.IO.Path]::GetExtension($fullPath)
  $context.Response.ContentType = $types[$ext]
  if (-not $context.Response.ContentType) { $context.Response.ContentType = "application/octet-stream" }
  $context.Response.ContentLength64 = $bytes.Length
  $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $context.Response.Close()
}
