using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.ComponentModel;
using Microsoft.Win32.SafeHandles;

public static class EvcrateNativeBridge {
    // Access & Security Constants
    const uint GENERIC_READ = 0x80000000;
    const uint GENERIC_WRITE = 0x40000000;
    const uint GENERIC_ALL = 0x10000000;
    const uint FILE_READ_DATA = 0x0001;
    const uint FILE_WRITE_DATA = 0x0002;
    const uint FILE_APPEND_DATA = 0x0004;
    const uint DELETE = 0x00010000;
    const uint READ_CONTROL = 0x00020000;
    const uint WRITE_DAC = 0x00040000;
    const uint WRITE_OWNER = 0x00080000;
    const uint SYNCHRONIZE = 0x00100000;
    const uint FILE_SHARE_READ = 0x00000001;
    const uint FILE_SHARE_WRITE = 0x00000002;
    const uint FILE_SHARE_DELETE = 0x00000004;
    const uint OPEN_EXISTING = 3;
    const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;

    const int SE_FILE_OBJECT = 1;
    const uint OWNER_SECURITY_INFORMATION = 0x00000001;
    const uint DACL_SECURITY_INFORMATION = 0x00000004;

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
    struct ACL_SIZE_INFORMATION {
        public uint AceCount;
        public uint AclBytesInUse;
        public uint AclBytesFree;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct ACE_HEADER {
        public byte AceType;
        public byte AceFlags;
        public ushort AceSize;
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

    // Win32 API
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern SafeFileHandle CreateFileW(
        string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern uint GetSecurityInfo(
        SafeFileHandle handle, int objectType, uint securityInfo,
        out IntPtr pOwner, out IntPtr pGroup, out IntPtr pDacl, out IntPtr pSacl, out IntPtr pSd);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool ConvertSidToStringSidW(IntPtr pSid, out IntPtr ptrSidString);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool GetAclInformation(IntPtr pAcl, out ACL_SIZE_INFORMATION pAclInfo, uint nAclInfoLength, int aclInfoClass);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool GetAce(IntPtr pAcl, uint dwAceIndex, out IntPtr pAce);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr LocalFree(IntPtr hMem);

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

    // Public API Methods

    public static string GetFileOwnerSid(string filePath) {
        if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath) && !Directory.Exists(filePath)) return null;
        using (var h = CreateFileW(filePath, READ_CONTROL, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, IntPtr.Zero)) {
            if (h.IsInvalid) return null;
            IntPtr pOwner, pGroup, pDacl, pSacl, pSd;
            if (GetSecurityInfo(h, SE_FILE_OBJECT, OWNER_SECURITY_INFORMATION, out pOwner, out pGroup, out pDacl, out pSacl, out pSd) != 0) return null;
            try {
                if (pOwner == IntPtr.Zero) return null;
                IntPtr pStr;
                if (!ConvertSidToStringSidW(pOwner, out pStr)) return null;
                string sid = Marshal.PtrToStringUni(pStr);
                LocalFree(pStr);
                return sid;
            } finally {
                if (pSd != IntPtr.Zero) LocalFree(pSd);
            }
        }
    }

    public static bool VerifyFileOwner(string filePath, string allowedUserSid, bool checkPrivateDacl) {
        if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath) && !Directory.Exists(filePath)) return false;
        using (var h = CreateFileW(filePath, READ_CONTROL, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, IntPtr.Zero)) {
            if (h.IsInvalid) return false;
            IntPtr pOwner, pGroup, pDacl, pSacl, pSd;
            if (GetSecurityInfo(h, SE_FILE_OBJECT, OWNER_SECURITY_INFORMATION | (checkPrivateDacl ? DACL_SECURITY_INFORMATION : 0), out pOwner, out pGroup, out pDacl, out pSacl, out pSd) != 0) return false;
            try {
                if (pOwner == IntPtr.Zero) return false;
                IntPtr pStr;
                if (!ConvertSidToStringSidW(pOwner, out pStr)) return false;
                string ownerSid = Marshal.PtrToStringUni(pStr);
                LocalFree(pStr);

                bool isOwner = string.Equals(ownerSid, allowedUserSid, StringComparison.OrdinalIgnoreCase);
                bool isAdmin = string.Equals(ownerSid, "S-1-5-32-544", StringComparison.OrdinalIgnoreCase);
                bool isSystem = string.Equals(ownerSid, "S-1-5-18", StringComparison.OrdinalIgnoreCase);
                if (!isOwner && !isAdmin && !isSystem) return false;

                if (checkPrivateDacl && pDacl != IntPtr.Zero) {
                    ACL_SIZE_INFORMATION aclInfo;
                    if (GetAclInformation(pDacl, out aclInfo, (uint)Marshal.SizeOf(typeof(ACL_SIZE_INFORMATION)), 2)) {
                        uint writeMask = DELETE | FILE_WRITE_DATA | FILE_APPEND_DATA | WRITE_DAC | WRITE_OWNER | GENERIC_WRITE | GENERIC_ALL;
                        for (uint i = 0; i < aclInfo.AceCount; i++) {
                            IntPtr pAce;
                            if (GetAce(pDacl, i, out pAce)) {
                                ACE_HEADER hdr = (ACE_HEADER)Marshal.PtrToStructure(pAce, typeof(ACE_HEADER));
                                if (hdr.AceType == 0) { // ACCESS_ALLOWED_ACE_TYPE
                                    uint mask = (uint)Marshal.ReadInt32(pAce, 4);
                                    if ((mask & writeMask) != 0) {
                                        IntPtr pSid = (IntPtr)((long)pAce + 8);
                                        IntPtr pAceStr;
                                        if (ConvertSidToStringSidW(pSid, out pAceStr)) {
                                            string aceSid = Marshal.PtrToStringUni(pAceStr);
                                            LocalFree(pAceStr);
                                            bool aceUser = string.Equals(aceSid, allowedUserSid, StringComparison.OrdinalIgnoreCase);
                                            bool aceAdmin = string.Equals(aceSid, "S-1-5-32-544", StringComparison.OrdinalIgnoreCase);
                                            bool aceSys = string.Equals(aceSid, "S-1-5-18", StringComparison.OrdinalIgnoreCase);
                                            if (!aceUser && !aceAdmin && !aceSys) return false;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                return true;
            } finally {
                if (pSd != IntPtr.Zero) LocalFree(pSd);
            }
        }
    }

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
}
