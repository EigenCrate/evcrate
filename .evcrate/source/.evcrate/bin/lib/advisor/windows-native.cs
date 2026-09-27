using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class EvcrateNativeBridge {
    // Native I/O and process constants
    const uint GENERIC_READ = 0x80000000;
    const uint GENERIC_WRITE = 0x40000000;
    const uint SYNCHRONIZE = 0x00100000;
    const uint OPEN_EXISTING = 3;
    const uint CREATE_NEW = 1;

    const uint FILE_SHARE_READ = 1;
    const uint FILE_SHARE_WRITE = 2;
    const uint FILE_SHARE_DELETE = 4;
    const uint FILE_ATTRIBUTE_DIRECTORY = 0x10;
    const uint FILE_ATTRIBUTE_REPARSE_POINT = 0x400;
    const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
    const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    const uint PROCESS_SET_QUOTA = 0x0100;
    const uint PROCESS_TERMINATE = 0x0001;
    const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    const int JobObjectExtendedLimitInformation = 9;

    [StructLayout(LayoutKind.Sequential)]
    struct FILETIME {
        public uint Low;
        public uint High;
        public ulong ToULong() { return ((ulong)High << 32) | (ulong)Low; }
    }

    [StructLayout(LayoutKind.Sequential)]
    struct IO_COUNTERS {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryLimit;
        public UIntPtr PeakJobMemoryLimit;
    }

    [StructLayout(LayoutKind.Explicit, Size = 20)]
    struct InputRecord {
        [FieldOffset(0)] public ushort Kind;
        [FieldOffset(4)] public int Down;
        [FieldOffset(14)] public char Character;
    }

    struct BY_HANDLE_FILE_INFORMATION {
        public uint dwFileAttributes;
        public FILETIME ftCreationTime;
        public FILETIME ftLastAccessTime;
        public FILETIME ftLastWriteTime;
        public uint dwVolumeSerialNumber;
        public uint nFileSizeHigh;
        public uint nFileSizeLow;
        public uint nNumberOfLinks;
        public uint nFileIndexHigh;
        public uint nFileIndexLow;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct FILE_RENAME_INFO {
        public bool ReplaceIfExists;
        public IntPtr RootDirectory;
        public uint FileNameLength;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string FileName;
    }
    // Win32 API
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern SafeFileHandle CreateFileW(
        string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetProcessTimes(IntPtr hProcess, out FILETIME lpCreationTime, out FILETIME lpExitTime, out FILETIME lpKernelTime, out FILETIME lpUserTime);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(SafeFileHandle handle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr CreateJobObjectW(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool TerminateJobObject(IntPtr hJob, uint uExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetConsoleMode(SafeFileHandle handle, out uint mode);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool WriteConsoleW(SafeFileHandle handle, string text, uint length, out uint written, IntPtr reserved);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool ReadConsoleInputW(SafeFileHandle handle, out InputRecord record, uint length, out uint read);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetFileInformationByHandle(SafeFileHandle hFile, out BY_HANDLE_FILE_INFORMATION lpFileInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool FlushFileBuffers(SafeFileHandle hFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetFileInformationByHandle(SafeFileHandle hFile, int FileInformationClass, IntPtr lpFileInformation, uint dwBufferSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool ReadFile(SafeFileHandle hFile, [Out] byte[] lpBuffer, uint nNumberOfBytesToRead, out uint lpNumberOfBytesRead, IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool WriteFile(SafeFileHandle hFile, byte[] lpBuffer, uint nNumberOfBytesToWrite, out uint lpNumberOfBytesWritten, IntPtr lpOverlapped);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool DeleteFileW(string lpFileName);

    // Public API Methods

    public static string GetProcessCreationTime(int pid) {
        if (pid <= 0) return null;
        IntPtr h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (h == IntPtr.Zero) return null;
        try {
            FILETIME c, e, k, u;
            if (GetProcessTimes(h, out c, out e, out k, out u)) {
                return c.ToULong().ToString();
            }
            return null;
        } finally {
            CloseHandle(h);
        }
    }

    public static string CheckProcessStatus(int pid, string expectedStart) {
        if (pid <= 0 || string.IsNullOrEmpty(expectedStart)) return "unknown";
        IntPtr h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, false, pid);
        if (h == IntPtr.Zero) {
            int err = Marshal.GetLastWin32Error();
            if (err == 87) return "dead"; // ERROR_INVALID_PARAMETER (PID does not exist)
            return "unknown";
        }
        try {
            FILETIME c, e, k, u;
            if (!GetProcessTimes(h, out c, out e, out k, out u)) return "unknown";
            string curStart = c.ToULong().ToString();
            if (curStart != expectedStart) return "dead"; // PID reused
            uint wait = WaitForSingleObject(h, 0);
            if (wait == 0) return "dead"; // WAIT_OBJECT_0: exited
            if (wait == 258) return "live"; // WAIT_TIMEOUT: running
            return "unknown";
        } finally {
            CloseHandle(h);
        }
    }

    public static string ObserveConsole(string challenge, int timeoutMs) {
        using (var input = CreateFileW("CONIN$", GENERIC_READ, 3, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero))
        using (var output = CreateFileW("CONOUT$", GENERIC_READ | GENERIC_WRITE, 3, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero)) {
            uint mode;
            if (input.IsInvalid || output.IsInvalid || !GetConsoleMode(input, out mode) || !GetConsoleMode(output, out mode)) {
                return "HUMAN_EVENT_REQUIRED";
            }
            string prompt = "\r\nHuman decision requested (local cooperative confirmation):\r\nType exactly: " + challenge + "\r\n> ";
            uint written;
            if (!WriteConsoleW(output, prompt, (uint)prompt.Length, out written, IntPtr.Zero)) {
                return "HUMAN_EVENT_REQUIRED";
            }
            string answer = "";
            var clock = System.Diagnostics.Stopwatch.StartNew();
            while (clock.ElapsedMilliseconds < timeoutMs) {
                uint wait = WaitForSingleObject(input, 100);
                if (wait == 258) continue;
                if (wait != 0) return "HUMAN_EVENT_REQUIRED";
                InputRecord rec; uint count;
                if (!ReadConsoleInputW(input, out rec, 1, out count)) return "HUMAN_EVENT_REQUIRED";
                if (count == 0 || rec.Kind != 1 || rec.Down == 0) continue;
                char ch = rec.Character;
                if (ch == '\u0003' || ch == '\u001b') return "CANCELLED";
                if (ch == '\r') {
                    return answer == challenge ? "OBSERVED" : "HUMAN_EVENT_REQUIRED";
                }
                if (ch == '\b') {
                    if (answer.Length > 0) {
                        answer = answer.Substring(0, answer.Length - 1);
                        WriteConsoleW(output, "\b \b", 3, out written, IntPtr.Zero);
                    }
                } else if (ch >= 32) {
                    if (answer.Length >= 256) return "HUMAN_EVENT_REQUIRED";
                    answer += ch;
                    WriteConsoleW(output, ch.ToString(), 1, out written, IntPtr.Zero);
                }
            }
            return "HUMAN_EVENT_REQUIRED";
        }
    }

    static System.Collections.Generic.List<SafeFileHandle> PinAncestors(string fullPath, bool isDirectory, bool forWrite, out string error) {
        error = null;
        var handles = new System.Collections.Generic.List<SafeFileHandle>();
        string normalized = System.IO.Path.GetFullPath(fullPath);
        string root = System.IO.Path.GetPathRoot(normalized);
        if (string.IsNullOrEmpty(root)) { error = "PATH_INVALID"; return null; }
        string dirPath = isDirectory ? normalized : System.IO.Path.GetDirectoryName(normalized);
        if (string.IsNullOrEmpty(dirPath)) { error = "PATH_INVALID"; return null; }
        var components = new System.Collections.Generic.List<string>();
        string current = dirPath;
        while (!string.IsNullOrEmpty(current) && !string.Equals(current, root, System.StringComparison.OrdinalIgnoreCase)) {
            components.Add(current);
            current = System.IO.Path.GetDirectoryName(current);
        }
        components.Add(root);
        components.Reverse();

        foreach (var comp in components) {
            uint share = (forWrite && string.Equals(comp, dirPath, System.StringComparison.OrdinalIgnoreCase))
                ? (FILE_SHARE_READ | FILE_SHARE_WRITE)
                : FILE_SHARE_READ;
            SafeFileHandle h = CreateFileW(comp, GENERIC_READ | SYNCHRONIZE, share, System.IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, System.IntPtr.Zero);
            if (h.IsInvalid) {
                int err = Marshal.GetLastWin32Error();
                CloseHandles(handles);
                error = "PIN_FAILED_" + err;
                return null;
            }
            BY_HANDLE_FILE_INFORMATION info;
            if (!GetFileInformationByHandle(h, out info)) {
                h.Close();
                CloseHandles(handles);
                error = "STAT_FAILED";
                return null;
            }
            if ((info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0) {
                h.Close();
                CloseHandles(handles);
                error = "NOT_DIRECTORY";
                return null;
            }
            if ((info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
                h.Close();
                CloseHandles(handles);
                error = "REPARSE_POINT_REJECTED";
                return null;
            }
            handles.Add(h);
        }
        return handles;
    }

    static void CloseHandles(System.Collections.Generic.List<SafeFileHandle> handles) {
        if (handles == null) return;
        for (int i = handles.Count - 1; i >= 0; i--) {
            try { handles[i].Dispose(); } catch {}
        }
        handles.Clear();
    }

    public static string VerifyPinnedDirectory(string dirPath) {
        string err;
        var pinned = PinAncestors(dirPath, true, false, out err);
        if (pinned == null) return "{\"status\":\"error\",\"code\":\"" + err + "\"}";
        try {
            return "{\"status\":\"ok\"}";
        } finally {
            CloseHandles(pinned);
        }
    }

    public static string ReadPinnedFile(string filePath, int maxBytes) {
        string error;
        var pinned = PinAncestors(filePath, false, false, out error);
        if (pinned == null) return "{\"status\":\"error\",\"code\":\"" + error + "\"}";
        try {
            using (var h = CreateFileW(filePath, GENERIC_READ | SYNCHRONIZE, FILE_SHARE_READ, System.IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, System.IntPtr.Zero)) {
                if (h.IsInvalid) {
                    int err = Marshal.GetLastWin32Error();
                    if (err == 2 || err == 3) return "{\"status\":\"not_found\"}";
                    return "{\"status\":\"error\",\"code\":\"OPEN_FAILED_" + err + "\"}";
                }
                BY_HANDLE_FILE_INFORMATION info;
                if (!GetFileInformationByHandle(h, out info)) return "{\"status\":\"error\",\"code\":\"STAT_FAILED\"}";
                if ((info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) return "{\"status\":\"error\",\"code\":\"REPARSE_POINT_REJECTED\"}";
                if ((info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0) return "{\"status\":\"error\",\"code\":\"NOT_REGULAR\"}";
                if (info.nNumberOfLinks > 1) return "{\"status\":\"error\",\"code\":\"MULTIPLY_LINKED\"}";
                long size = ((long)info.nFileSizeHigh << 32) | (long)info.nFileSizeLow;
                if (size > maxBytes) return "{\"status\":\"error\",\"code\":\"SIZE_LIMIT_EXCEEDED\"}";
                byte[] buf = new byte[size];
                uint read = 0;
                while (read < size) {
                    uint chunk;
                    if (!ReadFile(h, buf, (uint)(size - read), out chunk, System.IntPtr.Zero) || chunk == 0) return "{\"status\":\"error\",\"code\":\"READ_FAILED\"}";
                    read += chunk;
                }
                string b64 = System.Convert.ToBase64String(buf);
                string ino = (((ulong)info.nFileIndexHigh << 32) | (ulong)info.nFileIndexLow).ToString();
                return "{\"status\":\"ok\",\"dev\":\"" + info.dwVolumeSerialNumber + "\",\"ino\":\"" + ino + "\",\"size\":" + size + ",\"bytes\":\"" + b64 + "\"}";
            }
        } finally {
            CloseHandles(pinned);
        }
    }

    public static string WritePinnedFile(string filePath, string base64Bytes, bool replaceIfExists, string expectedDev, string expectedIno, string expectedDigest) {
        string error;
        var pinned = PinAncestors(filePath, false, true, out error);
        if (pinned == null) return "{\"status\":\"error\",\"code\":\"" + error + "\"}";
        string dirPath = System.IO.Path.GetDirectoryName(filePath);
        string tmpName = ".state-" + System.Guid.NewGuid().ToString("N") + ".tmp";
        string tmpPath = System.IO.Path.Combine(dirPath, tmpName);
        byte[] bytes = System.Convert.FromBase64String(base64Bytes);

        try {
            using (var hStaged = CreateFileW(tmpPath, GENERIC_READ | GENERIC_WRITE | 0x00010000 | SYNCHRONIZE, 1 | 2 | 4, System.IntPtr.Zero, CREATE_NEW, FILE_FLAG_OPEN_REPARSE_POINT, System.IntPtr.Zero)) {
                if (hStaged.IsInvalid) {
                    int err = Marshal.GetLastWin32Error();
                    return "{\"status\":\"error\",\"code\":\"STAGE_CREATE_FAILED_" + err + "\"}";
                }
                uint written;
                if (!WriteFile(hStaged, bytes, (uint)bytes.Length, out written, System.IntPtr.Zero) || written != bytes.Length) {
                    DeleteFileW(tmpPath);
                    return "{\"status\":\"error\",\"code\":\"WRITE_FAILED\"}";
                }
                FlushFileBuffers(hStaged);

                if (replaceIfExists) {
                    if (string.IsNullOrEmpty(expectedDev) || string.IsNullOrEmpty(expectedIno)) {
                        DeleteFileW(tmpPath);
                        return "{\"status\":\"conflict\",\"code\":\"STATE_CONFLICT\"}";
                    }
                    using (var hTarget = CreateFileW(filePath, GENERIC_READ | SYNCHRONIZE, 1 | 2 | 4, System.IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, System.IntPtr.Zero)) {
                        if (hTarget.IsInvalid) {
                            DeleteFileW(tmpPath);
                            return "{\"status\":\"conflict\",\"code\":\"STATE_CONFLICT\"}";
                        }
                        BY_HANDLE_FILE_INFORMATION tInfo;
                        if (!GetFileInformationByHandle(hTarget, out tInfo)) {
                            DeleteFileW(tmpPath);
                            return "{\"status\":\"conflict\",\"code\":\"STATE_CONFLICT\"}";
                        }
                        if ((tInfo.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0 || (tInfo.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0) {
                            DeleteFileW(tmpPath);
                            return "{\"status\":\"conflict\",\"code\":\"STATE_CONFLICT\"}";
                        }
                        string tIno = (((ulong)tInfo.nFileIndexHigh << 32) | (ulong)tInfo.nFileIndexLow).ToString();
                        if (tInfo.dwVolumeSerialNumber.ToString() != expectedDev || tIno != expectedIno) {
                            DeleteFileW(tmpPath);
                            return "{\"status\":\"conflict\",\"code\":\"STATE_CONFLICT\"}";
                        }
                        if (!string.IsNullOrEmpty(expectedDigest)) {
                            long tSize = ((long)tInfo.nFileSizeHigh << 32) | (long)tInfo.nFileSizeLow;
                            byte[] tBytes = new byte[tSize];
                            uint tRead = 0;
                            while (tRead < tSize) {
                                uint chunk;
                                if (!ReadFile(hTarget, tBytes, (uint)(tSize - tRead), out chunk, System.IntPtr.Zero) || chunk == 0) break;
                                tRead += chunk;
                            }
                            if (tRead != tSize) {
                                DeleteFileW(tmpPath);
                                return "{\"status\":\"conflict\",\"code\":\"STATE_CONFLICT\"}";
                            }
                            using (var sha = System.Security.Cryptography.SHA256.Create()) {
                                string hex = System.BitConverter.ToString(sha.ComputeHash(tBytes)).Replace("-", "").ToLowerInvariant();
                                if (hex != expectedDigest.ToLowerInvariant()) {
                                    DeleteFileW(tmpPath);
                                    return "{\"status\":\"conflict\",\"code\":\"STATE_CONFLICT\"}";
                                }
                            }
                        }
                    }
                }

                FILE_RENAME_INFO renameInfo = new FILE_RENAME_INFO();
                renameInfo.ReplaceIfExists = replaceIfExists;
                renameInfo.RootDirectory = System.IntPtr.Zero;
                renameInfo.FileNameLength = (uint)(filePath.Length * 2);
                renameInfo.FileName = filePath;

                int infoSize = Marshal.SizeOf(renameInfo);
                System.IntPtr pInfo = Marshal.AllocHGlobal(infoSize);
                try {
                    Marshal.StructureToPtr(renameInfo, pInfo, false);
                    bool ok = SetFileInformationByHandle(hStaged, 3, pInfo, (uint)infoSize);
                    if (!ok) {
                        int err = Marshal.GetLastWin32Error();
                        DeleteFileW(tmpPath);
                        if (err == 183 || err == 80) return "{\"status\":\"conflict\",\"code\":\"STATE_CONFLICT\"}";
                        return "{\"status\":\"error\",\"code\":\"RENAME_FAILED_" + err + "\"}";
                    }
                } finally {
                    Marshal.FreeHGlobal(pInfo);
                }

                BY_HANDLE_FILE_INFORMATION destInfo;
                if (GetFileInformationByHandle(hStaged, out destInfo)) {
                    string ino = (((ulong)destInfo.nFileIndexHigh << 32) | (ulong)destInfo.nFileIndexLow).ToString();
                    return "{\"status\":\"ok\",\"dev\":\"" + destInfo.dwVolumeSerialNumber + "\",\"ino\":\"" + ino + "\"}";
                }
                return "{\"status\":\"ok\"}";
            }
        } catch (System.Exception ex) {
            DeleteFileW(tmpPath);
            return "{\"status\":\"error\",\"code\":\"" + ex.Message.Replace("\"", "'") + "\"}";
        } finally {
            CloseHandles(pinned);
        }
    }
}
