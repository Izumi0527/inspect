#define AppName "Inspect"
#define AppVersion "1.0.2"
#define AppPublisher "Inspect Team"
#define RuntimeRoot "..\build\installer\InspectRuntime"

[Setup]
AppId={{B17E5C20-5A33-4DF2-BE93-40A141960D9B}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\Inspect
DefaultGroupName=Inspect
OutputDir=..\build\installer-output
OutputBaseFilename=InspectSetup
SetupIconFile=assets\inspect.ico
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
DisableProgramGroupPage=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#RuntimeRoot}\backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#RuntimeRoot}\frontend\*"; DestDir: "{app}\frontend"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#RuntimeRoot}\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "assets\inspect.ico"; DestDir: "{app}\assets"; Flags: ignoreversion
Source: "docker-compose.installer.yml"; DestDir: "{app}"; Flags: ignoreversion
Source: "config\.env.example"; DestDir: "{app}\config"; Flags: ignoreversion onlyifdoesntexist
Source: "database\inspect-runtime-seed.sql"; DestDir: "{app}\database"; Flags: ignoreversion
Source: "..\database\database-init-complete.sql"; DestDir: "{app}\database"; Flags: ignoreversion
Source: "..\database\builtin-templates-complete.sql"; DestDir: "{app}\database"; Flags: ignoreversion
Source: "..\config\postgres\postgresql.conf"; DestDir: "{app}\config\postgres"; Flags: ignoreversion
Source: "scripts\*.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion

[Dirs]
Name: "{app}\config"; Permissions: users-modify
Name: "{app}\logs"; Permissions: users-modify
Name: "{app}\logs\backend-go"; Permissions: users-modify
Name: "{app}\data"; Permissions: users-modify
Name: "{app}\data\postgres"; Permissions: users-modify
Name: "{app}\data\redis"; Permissions: users-modify
Name: "{app}\data\reports"; Permissions: users-modify
Name: "{app}\data\reports\monitoring"; Permissions: users-modify
Name: "{app}\data\backups"; Permissions: users-modify

[Icons]
Name: "{group}\Inspect 启动服务"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\start-all.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\inspect.ico"
Name: "{group}\Inspect 停止服务"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\stop-all.ps1"""; WorkingDir: "{app}"
Name: "{group}\Inspect 前端"; Filename: "http://localhost:3000"
Name: "{commondesktop}\Inspect 启动服务"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\start-all.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\inspect.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "创建桌面启动快捷方式"; GroupDescription: "附加任务："

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\start-all.ps1"""; Description: "安装完成后启动 Inspect"; Flags: postinstall skipifsilent nowait unchecked

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\stop-all.ps1"""; Flags: runhidden waituntilterminated
