param([int]$NodePid)
# Prints "<pid>|<luid>|<dedicated|shared>|<bytes>" for every GPU-memory counter instance that
# belongs to a msedge.exe child (or grandchild) of the given node process.
$all = Get-CimInstance Win32_Process
$browser = $all | Where-Object { $_.ParentProcessId -eq $NodePid -and $_.Name -eq 'msedge.exe' }
$ids = @($browser.ProcessId) + @(($all | Where-Object { $browser.ProcessId -contains $_.ParentProcessId }).ProcessId)
$samples = (Get-Counter -Counter '\GPU Process Memory(*)\Dedicated Usage', '\GPU Process Memory(*)\Shared Usage' -ErrorAction SilentlyContinue).CounterSamples
foreach ($s in $samples) {
    if ($s.InstanceName -match '^pid_(\d+)_(luid_0x[0-9a-f]+_0x[0-9a-f]+)') {
        $procId = [int]$Matches[1]; $luid = $Matches[2]
        if ($ids -contains $procId -and $s.CookedValue -gt 0) {
            $kind = if ($s.Path -like '*dedicated usage') { 'dedicated' } else { 'shared' }
            "$procId|$luid|$kind|$($s.CookedValue)"
        }
    }
}
