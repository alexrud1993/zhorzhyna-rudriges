# Зберігає ключ Gemini API у файл ПОЗА репозиторієм (SEC-102). Ключ вводиться приховано й ніде не друкується.
# Запуск: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\data\set-gemini-key.ps1
$dir = Join-Path $env:USERPROFILE '.config\zhorzhyna'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Write-Host 'Створіть ключ на https://aistudio.google.com/apikey (Get API key), скопіюйте його.'
$sec = Read-Host -AsSecureString 'Вставте ключ Gemini API (символи не відображаються) і натисніть Enter'
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
$plain = $plain.Trim()
if ($plain.Length -lt 20) { Write-Host 'Ключ закороткий або порожній - нічого не збережено.'; exit 1 }
$file = Join-Path $dir 'gemini.env'
[IO.File]::WriteAllText($file, "GEMINI_API_KEY=$plain")
$plain = $null
icacls $file /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
Write-Host "Готово: ключ збережено у $file (доступ лише для користувача $($env:USERNAME))."
