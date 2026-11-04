import { execFile } from "node:child_process";

/**
 * Data shown in the "why are you stopping?" popup.
 */
export type StopReasonPrompt = {
    title: string;
    message: string;
    reasons: string[]; // predefined reasons offered in the dropdown
    initial: string; // pre-filled text (usually the current description)
};

// Closing the dialog after this long counts as "cancel", so a forgotten popup never blocks the plugin forever.
const DIALOG_TIMEOUT_MS = 10 * 60_000;

// Exit code both helper scripts use when the user cancels the dialog.
const CANCEL_EXIT_CODE = 1;

/**
 * Windows: a small WinForms dialog with an editable dropdown (pick a predefined reason or type a new one).
 * The prompt data is passed as JSON through an environment variable to avoid any quoting issues.
 */
const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$data = $env:SOLIDTIME_STOP_PROMPT | ConvertFrom-Json

$form = New-Object System.Windows.Forms.Form
$form.Text = $data.title
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$form.ClientSize = New-Object System.Drawing.Size(440, 160)

$label = New-Object System.Windows.Forms.Label
$label.Text = $data.message
$label.Location = New-Object System.Drawing.Point(12, 10)
$label.Size = New-Object System.Drawing.Size(416, 58)
$form.Controls.Add($label)

$combo = New-Object System.Windows.Forms.ComboBox
$combo.DropDownStyle = 'DropDown'
$combo.Location = New-Object System.Drawing.Point(12, 72)
$combo.Size = New-Object System.Drawing.Size(416, 28)
$combo.MaxLength = 500
foreach ($r in @($data.reasons)) { if ($r) { [void]$combo.Items.Add([string]$r) } }
$combo.AutoCompleteMode = 'SuggestAppend'
$combo.AutoCompleteSource = 'ListItems'
$combo.Text = [string]$data.initial
$form.Controls.Add($combo)

$ok = New-Object System.Windows.Forms.Button
$ok.Text = 'Speichern'
$ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
$ok.Location = New-Object System.Drawing.Point(232, 116)
$ok.Size = New-Object System.Drawing.Size(96, 32)
$form.Controls.Add($ok)
$form.AcceptButton = $ok

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = 'Abbrechen'
$cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$cancel.Location = New-Object System.Drawing.Point(334, 116)
$cancel.Size = New-Object System.Drawing.Size(96, 32)
$form.Controls.Add($cancel)
$form.CancelButton = $cancel

# The process is started hidden (no console flash) and Windows applies that "hidden" start flag to the
# dialog as well, so show it explicitly through the Win32 API once it exists.
Add-Type -Namespace SolidtimeDeck -Name Win32 -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
'@
$form.Add_Shown({
    [void][SolidtimeDeck.Win32]::ShowWindow($form.Handle, 5)
    [void][SolidtimeDeck.Win32]::SetForegroundWindow($form.Handle)
    $form.Activate(); $combo.Focus(); $combo.SelectAll()
})
$result = $form.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.Write($combo.Text)
    exit 0
}
exit ${CANCEL_EXIT_CODE}
`;

/**
 * macOS (JXA): choose from the predefined reasons, or enter a custom one in a text dialog.
 * Any thrown error (including the user pressing "Abbrechen") makes osascript exit with code 1.
 */
const MAC_SCRIPT = `
function run(argv) {
    const d = JSON.parse(argv[0]);
    const app = Application.currentApplication();
    app.includeStandardAdditions = true;
    app.activate();
    const custom = 'Eigener Grund …';
    if (d.reasons.length > 0) {
        const pick = app.chooseFromList(d.reasons.concat([custom]), {
            withTitle: d.title,
            withPrompt: d.message,
            okButtonName: 'Speichern',
            cancelButtonName: 'Abbrechen'
        });
        if (pick === false) throw new Error('cancelled');
        if (pick[0] !== custom) return pick[0];
    }
    const res = app.displayDialog(d.message, {
        withTitle: d.title,
        defaultAnswer: d.initial,
        buttons: ['Abbrechen', 'Speichern'],
        defaultButton: 'Speichern',
        cancelButton: 'Abbrechen'
    });
    return res.textReturned;
}
`;

/**
 * Splits the "one reason per line" setting into a clean, de-duplicated list.
 */
export function parseReasons(raw: string | undefined): string[] {
    if (!raw) return [];
    const reasons = raw.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
    return [...new Set(reasons)];
}

/**
 * Shows a native popup on the computer asking for the reason a timer is stopped.
 * @returns The entered reason, or `null` if the user cancelled. Rejects if the dialog could not be shown.
 */
export function promptStopReason(prompt: StopReasonPrompt): Promise<string | null> {
    return new Promise((resolve, reject) => {
        const callback = (error: (Error & { code?: unknown; killed?: boolean }) | null, stdout: string) => {
            if (!error) {
                // osascript appends a newline to the returned value
                resolve(stdout.replace(/\r?\n$/, ""));
                return;
            }
            if (error.code === CANCEL_EXIT_CODE || error.killed) {
                resolve(null);
                return;
            }
            reject(error);
        };

        if (process.platform === "win32") {
            const encoded = Buffer.from(WINDOWS_SCRIPT, "utf16le").toString("base64");
            execFile(
                "powershell.exe",
                ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
                {
                    env: { ...process.env, SOLIDTIME_STOP_PROMPT: JSON.stringify(prompt) },
                    windowsHide: true,
                    timeout: DIALOG_TIMEOUT_MS,
                    encoding: "utf8",
                },
                callback
            );
        } else if (process.platform === "darwin") {
            execFile(
                "osascript",
                ["-l", "JavaScript", "-e", MAC_SCRIPT, JSON.stringify(prompt)],
                { timeout: DIALOG_TIMEOUT_MS, encoding: "utf8" },
                callback
            );
        } else {
            reject(new Error(`Stop reason dialog is not supported on ${process.platform}.`));
        }
    });
}
