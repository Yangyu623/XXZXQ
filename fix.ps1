$path = "C:\Users\Yangyujie\OneDrive\Desktop\XXZXQ\js\app.js"
$lines = [System.IO.File]::ReadAllLines($path, [System.Text.UTF8Encoding]::new($false))

$lines[575] = '    const keyword = (document.getElementById(''adminSearchInput'').value || '''').trim().toLowerCase();'
$lines[576] = '    const filtered = keyword ? (data || []).filter(u => u.nickname.toLowerCase().includes(keyword)) : (data || []);'
$lines[577] = '    if (!filtered || filtered.length === 0) {'
$lines[578] = '      list.innerHTML = ''<div class="tip">'' + (keyword ? ''没有匹配用户'' : (adminTab === ''pending'' ? ''没有待审核用户'' : ''没有已通过用户'')) + ''</div>'';'
$lines[579] = '      return;'
$lines[580] = '    }'
$lines[581] = ''
$lines[582] = '    list.innerHTML = filtered.map(u => ''<div class="admin-user-item">'' +'

[System.IO.File]::WriteAllLines($path, $lines, [System.Text.UTF8Encoding]::new($false))
Write-Output "Done"
