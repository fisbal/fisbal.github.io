// TechFix FAT32 formatter — any size up to 2 TB (Windows' own tools refuse FAT32 above 32 GB,
// which consoles like the 3DS, Wii, PS3 and Switch homebrew need). Same layout as the classic
// fat32format: 32 reserved sectors, 2 FATs, root directory in cluster 2, FSInfo + backup boot.
// Written for C# 5 so Windows PowerShell 5.1's Add-Type can compile it on any Windows 10/11.
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class TFFat32
{
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr sa, uint disposition, uint flags, IntPtr template);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool DeviceIoControl(SafeFileHandle h, uint code, IntPtr inBuf, uint inSize, byte[] outBuf, uint outSize, out uint returned, IntPtr overlapped);

    const uint FSCTL_LOCK_VOLUME = 0x00090018;
    const uint FSCTL_DISMOUNT_VOLUME = 0x00090020;
    const uint FSCTL_ALLOW_EXTENDED_DASD_IO = 0x00090083;
    const uint IOCTL_DISK_GET_DRIVE_GEOMETRY = 0x00070000;
    const uint IOCTL_DISK_GET_PARTITION_INFO_EX = 0x00070048;

    static byte[] Ioctl(SafeFileHandle h, uint code, int size, bool must)
    {
        byte[] buf = new byte[Math.Max(size, 1)];
        uint ret;
        bool ok = DeviceIoControl(h, code, IntPtr.Zero, 0, buf, (uint)size, out ret, IntPtr.Zero);
        if (!ok && must) throw new IOException("DeviceIoControl 0x" + code.ToString("X") + " failed (error " + Marshal.GetLastWin32Error() + ")");
        return buf;
    }

    // Formats a mounted volume, e.g. @"\\?\Volume{guid}" or @"\\.\E:".
    public static string FormatVolume(string volumePath, int clusterBytes, string label)
    {
        SafeFileHandle h = CreateFile(volumePath, 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
        if (h.IsInvalid) throw new IOException("Cannot open " + volumePath + " (error " + Marshal.GetLastWin32Error() + ")");
        try
        {
            Ioctl(h, FSCTL_ALLOW_EXTENDED_DASD_IO, 0, false);
            Ioctl(h, FSCTL_LOCK_VOLUME, 0, true);
            Ioctl(h, FSCTL_DISMOUNT_VOLUME, 0, true);
            byte[] g = Ioctl(h, IOCTL_DISK_GET_DRIVE_GEOMETRY, 24, true);
            int tracksPerCyl = BitConverter.ToInt32(g, 12);
            int sectorsPerTrack = BitConverter.ToInt32(g, 16);
            int bytesPerSector = BitConverter.ToInt32(g, 20);
            byte[] p = Ioctl(h, IOCTL_DISK_GET_PARTITION_INFO_EX, 144, true);
            long start = BitConverter.ToInt64(p, 8);
            long length = BitConverter.ToInt64(p, 16);
            string r;
            using (FileStream fs = new FileStream(h, FileAccess.ReadWrite, 1, false))
            {
                r = Build(fs, length, bytesPerSector, start / bytesPerSector, sectorsPerTrack, tracksPerCyl, clusterBytes, label, (uint)Environment.TickCount ^ (uint)DateTime.Now.Ticks);
                fs.Flush();
            }
            Ioctl(h, FSCTL_DISMOUNT_VOLUME, 0, false);
            return r;
        }
        finally { if (!h.IsClosed) h.Close(); }
    }

    static void Put16(byte[] b, int o, int v) { b[o] = (byte)v; b[o + 1] = (byte)(v >> 8); }
    static void Put32(byte[] b, int o, uint v) { b[o] = (byte)v; b[o + 1] = (byte)(v >> 8); b[o + 2] = (byte)(v >> 16); b[o + 3] = (byte)(v >> 24); }

    static void WriteAt(Stream s, long offset, byte[] data)
    {
        s.Seek(offset, SeekOrigin.Begin);
        s.Write(data, 0, data.Length);
    }

    // Lays out the file system on any stream (a volume, or an image file for tests).
    // Returns "clusters=N;fatSectors=N;clusterBytes=N".
    public static string Build(Stream s, long lengthBytes, int bps, long hiddenSectors, int sectorsPerTrack, int heads, int clusterBytes, string label, uint volumeId)
    {
        if (bps != 512 && bps != 1024 && bps != 2048 && bps != 4096) throw new IOException("Unsupported sector size " + bps);
        long totalSectors = lengthBytes / bps;
        if (totalSectors > 0xFFFFFFFFL) throw new IOException("TOO_BIG: FAT32 can't hold more than 2 TB");
        if (clusterBytes <= 0)
        {
            long gb = lengthBytes / (1024L * 1024 * 1024);
            clusterBytes = gb < 8 ? 4096 : gb < 16 ? 8192 : gb < 32 ? 16384 : 32768;
        }
        int spc = Math.Max(1, clusterBytes / bps);
        if (spc > 128 || (spc & (spc - 1)) != 0) throw new IOException("Unsupported cluster size " + clusterBytes);
        const int reserved = 32;
        const int numFats = 2;
        long fatSize = (4L * (totalSectors - reserved)) / ((long)spc * bps + 4L * numFats) + 1;
        long userArea = totalSectors - reserved - numFats * fatSize;
        long clusters = userArea / spc;
        // The FAT must hold one entry per cluster plus the two reserved entries.
        while ((clusters + 2) * 4 > fatSize * bps)
        {
            fatSize++;
            userArea = totalSectors - reserved - numFats * fatSize;
            clusters = userArea / spc;
        }
        if (clusters < 65525) throw new IOException("TOO_SMALL: too few clusters for FAT32 - choose a smaller cluster size");
        if (clusters > 0x0FFFFFF5L) throw new IOException("TOO_MANY: too many clusters - choose a bigger cluster size");
        if ((clusters + 2) * 4 > fatSize * bps) throw new IOException("FAT size calculation error");

        // 1) Zero the reserved area, both FATs and the root cluster.
        long systemArea = (reserved + numFats * fatSize + spc) * (long)bps;
        byte[] zero = new byte[1024 * 1024];
        s.Seek(0, SeekOrigin.Begin);
        for (long done = 0; done < systemArea; )
        {
            int n = (int)Math.Min(zero.Length, systemArea - done);
            s.Write(zero, 0, n);
            done += n;
        }

        // 2) Boot sector (and its backup in sector 6).
        byte[] boot = new byte[bps];
        boot[0] = 0xEB; boot[1] = 0x58; boot[2] = 0x90;
        byte[] oem = System.Text.Encoding.ASCII.GetBytes("MSWIN4.1");
        Array.Copy(oem, 0, boot, 3, 8);
        Put16(boot, 11, bps);
        boot[13] = (byte)spc;
        Put16(boot, 14, reserved);
        boot[16] = numFats;
        Put16(boot, 17, 0);
        Put16(boot, 19, 0);
        boot[21] = 0xF8;
        Put16(boot, 22, 0);
        Put16(boot, 24, sectorsPerTrack > 0 && sectorsPerTrack < 65536 ? sectorsPerTrack : 63);
        Put16(boot, 26, heads > 0 && heads < 65536 ? heads : 255);
        Put32(boot, 28, (uint)hiddenSectors);
        Put32(boot, 32, (uint)totalSectors);
        Put32(boot, 36, (uint)fatSize);
        Put16(boot, 40, 0);
        Put16(boot, 42, 0);
        Put32(boot, 44, 2);
        Put16(boot, 48, 1);
        Put16(boot, 50, 6);
        boot[64] = 0x80;
        boot[66] = 0x29;
        Put32(boot, 67, volumeId);
        byte[] lab = LabelBytes(label);
        Array.Copy(lab, 0, boot, 71, 11);
        Array.Copy(System.Text.Encoding.ASCII.GetBytes("FAT32   "), 0, boot, 82, 8);
        // Tiny boot code: "not a system disk" loop, like any formatter leaves.
        byte[] code = { 0x0E, 0x1F, 0xBE, 0x77, 0x7C, 0xAC, 0x22, 0xC0, 0x74, 0x0B, 0x56, 0xB4, 0x0E, 0xBB, 0x07, 0x00, 0xCD, 0x10, 0x5E, 0xEB, 0xF0, 0x32, 0xE4, 0xCD, 0x16, 0xCD, 0x19, 0xEB, 0xFE };
        Array.Copy(code, 0, boot, 90, code.Length);
        byte[] msg = System.Text.Encoding.ASCII.GetBytes("This is not a bootable disk. Remove it and press any key.\r\n");
        Array.Copy(msg, 0, boot, 0x77, msg.Length);
        boot[510] = 0x55; boot[511] = 0xAA;

        // 3) FSInfo (and its backup in sector 7).
        byte[] info = new byte[bps];
        Put32(info, 0, 0x41615252);
        Put32(info, 484, 0x61417272);
        Put32(info, 488, (uint)(clusters - 1));
        Put32(info, 492, 3);
        Put32(info, 508, 0xAA550000);

        // Sector 2 / 8: the third boot sector only carries the signature.
        byte[] third = new byte[bps];
        third[510] = 0x55; third[511] = 0xAA;

        WriteAt(s, 0, boot);
        WriteAt(s, 1L * bps, info);
        WriteAt(s, 2L * bps, third);
        WriteAt(s, 6L * bps, boot);
        WriteAt(s, 7L * bps, info);
        WriteAt(s, 8L * bps, third);

        // 4) First FAT sector of each copy: media, end-of-chain, root directory end.
        byte[] fat0 = new byte[bps];
        Put32(fat0, 0, 0x0FFFFFF8);
        Put32(fat0, 4, 0x0FFFFFFF);
        Put32(fat0, 8, 0x0FFFFFFF);
        for (int i = 0; i < numFats; i++) WriteAt(s, (reserved + i * fatSize) * (long)bps, fat0);

        // 5) Volume label entry in the root directory.
        if (label != null && label.Trim().Length > 0)
        {
            byte[] root = new byte[bps];
            Array.Copy(lab, 0, root, 0, 11);
            root[11] = 0x08;
            WriteAt(s, (reserved + numFats * fatSize) * (long)bps, root);
        }
        s.Flush();
        return "clusters=" + clusters + ";fatSectors=" + fatSize + ";clusterBytes=" + (spc * bps);
    }

    static byte[] LabelBytes(string label)
    {
        string l = (label ?? "").Trim().ToUpperInvariant();
        byte[] b = new byte[11];
        for (int i = 0; i < 11; i++) b[i] = 0x20;
        if (l.Length == 0) { byte[] none = System.Text.Encoding.ASCII.GetBytes("NO NAME    "); return none; }
        for (int i = 0; i < l.Length && i < 11; i++)
        {
            char c = l[i];
            b[i] = (byte)((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == ' ' || c == '_' || c == '-' ? c : '_');
        }
        return b;
    }
}
