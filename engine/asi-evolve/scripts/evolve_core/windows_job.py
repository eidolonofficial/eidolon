"""Windows evaluator lifetime containment: assign a suspended child, then resume.

A Job Object owns all descendants until close. This limits process lifetime only;
it does not restrict filesystem/network access and is not a code sandbox.
"""
from __future__ import annotations
import ctypes
from ctypes import wintypes as W
import os


class WindowsJob:
    def __init__(self, process):
        if os.name != 'nt':
            raise OSError('Windows Job Objects are only available on Windows')
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel, self.handle = kernel, None
        class Basic(ctypes.Structure):
            _fields_ = [('process_time', ctypes.c_longlong), ('job_time', ctypes.c_longlong),
                        ('flags', W.DWORD), ('min_working', ctypes.c_size_t),
                        ('max_working', ctypes.c_size_t), ('active_limit', W.DWORD),
                        ('affinity', ctypes.c_size_t), ('priority', W.DWORD), ('scheduling', W.DWORD)]
        class Io(ctypes.Structure):
            _fields_ = [(name, ctypes.c_ulonglong) for name in
                        ('reads', 'writes', 'other', 'read_bytes', 'write_bytes', 'other_bytes')]
        class Extended(ctypes.Structure):
            _fields_ = [('basic', Basic), ('io', Io), ('process_memory', ctypes.c_size_t),
                        ('job_memory', ctypes.c_size_t), ('peak_process', ctypes.c_size_t),
                        ('peak_job', ctypes.c_size_t)]
        kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, W.LPCWSTR]
        kernel.CreateJobObjectW.restype = W.HANDLE
        kernel.SetInformationJobObject.argtypes = [W.HANDLE, ctypes.c_int, ctypes.c_void_p, W.DWORD]
        kernel.SetInformationJobObject.restype = W.BOOL
        kernel.AssignProcessToJobObject.argtypes = [W.HANDLE, W.HANDLE]
        kernel.AssignProcessToJobObject.restype = W.BOOL
        kernel.TerminateJobObject.argtypes = [W.HANDLE, W.UINT]
        kernel.TerminateJobObject.restype = W.BOOL
        kernel.CloseHandle.argtypes = [W.HANDLE]
        kernel.CloseHandle.restype = W.BOOL
        handle = kernel.CreateJobObjectW(None, None)
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        self.handle = handle
        try:
            limits = Extended()
            limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if not kernel.SetInformationJobObject(handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
                raise ctypes.WinError(ctypes.get_last_error())
            # CPython's Popen retains the process handle until the object is disposed.
            if not kernel.AssignProcessToJobObject(handle, W.HANDLE(int(process._handle))):
                raise ctypes.WinError(ctypes.get_last_error())
            self._resume(process.pid)
        except BaseException:
            self.close()
            process.kill()
            process.wait(timeout=5)
            raise

    def _resume(self, pid):
        kernel = self.kernel
        class ThreadEntry(ctypes.Structure):
            _fields_ = [('size', W.DWORD), ('usage', W.DWORD), ('thread', W.DWORD),
                        ('process', W.DWORD), ('priority', W.LONG), ('delta', W.LONG), ('flags', W.DWORD)]
        kernel.CreateToolhelp32Snapshot.argtypes = [W.DWORD, W.DWORD]
        kernel.CreateToolhelp32Snapshot.restype = W.HANDLE
        for name in ('Thread32First', 'Thread32Next'):
            function = getattr(kernel, name)
            function.argtypes = [W.HANDLE, ctypes.POINTER(ThreadEntry)]
            function.restype = W.BOOL
        kernel.OpenThread.argtypes = [W.DWORD, W.BOOL, W.DWORD]
        kernel.OpenThread.restype = W.HANDLE
        kernel.ResumeThread.argtypes = [W.HANDLE]
        kernel.ResumeThread.restype = W.DWORD
        snapshot = kernel.CreateToolhelp32Snapshot(4, 0)  # TH32CS_SNAPTHREAD
        if snapshot == ctypes.c_void_p(-1).value:
            raise ctypes.WinError(ctypes.get_last_error())
        resumed = 0
        try:
            entry = ThreadEntry(); entry.size = ctypes.sizeof(entry)
            present = kernel.Thread32First(snapshot, ctypes.byref(entry))
            while present:
                if entry.process == pid:
                    thread = kernel.OpenThread(0x0002, False, entry.thread)  # THREAD_SUSPEND_RESUME
                    if not thread:
                        raise ctypes.WinError(ctypes.get_last_error())
                    try:
                        if kernel.ResumeThread(thread) == 0xFFFFFFFF:
                            raise ctypes.WinError(ctypes.get_last_error())
                        resumed += 1
                    finally:
                        kernel.CloseHandle(thread)
                present = kernel.Thread32Next(snapshot, ctypes.byref(entry))
        finally:
            kernel.CloseHandle(snapshot)
        if not resumed:
            raise RuntimeError('Could not resume the contained evaluator; it was terminated')

    def terminate(self):
        if self.handle and not self.kernel.TerminateJobObject(self.handle, 124):
            raise ctypes.WinError(ctypes.get_last_error())

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None
