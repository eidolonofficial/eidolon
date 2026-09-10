"""Regression coverage for OS-managed temporary-directory path aliases."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


class TemporaryPathTests(unittest.TestCase):
    def test_demo_accepts_temp_parent_alias_without_relaxing_confinement(self):
        """macOS /var aliases and equivalent temp-parent links remain usable."""
        engine = Path(__file__).resolve().parents[1] / 'asi-evolve'
        spec = importlib.util.spec_from_file_location(
            'packing_temp_alias', engine / 'experiments/circle_packing_demo/evaluator.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        original = tempfile.TemporaryDirectory
        with original(prefix='eidolon-temp-alias-') as directory:
            root = Path(directory).resolve(strict=True)
            actual = root / 'actual'
            actual.mkdir()
            alias = root / 'alias'
            try:
                alias.symlink_to(actual, target_is_directory=True)
            except (OSError, NotImplementedError) as exc:
                self.skipTest(f'Directory symlinks unavailable: {type(exc).__name__}')
            source = root / 'candidate.py'
            source.write_text(
                'import numpy as np\n'
                'def construct_packing():\n'
                '    return np.full((26, 2), 0.5), np.zeros(26), 0.0\n',
                encoding='utf-8')

            def aliased_temporary_directory(**kwargs):
                return original(dir=alias, **kwargs)

            with patch.object(module.tempfile, 'TemporaryDirectory', aliased_temporary_directory):
                centers, radii, total = module.run_with_timeout(source, timeout_seconds=10)
            self.assertEqual(centers.shape, (26, 2))
            self.assertEqual(radii.shape, (26,))
            self.assertEqual(total, 0.0)
            # Resolving our own fresh temporary directory does not permit a linked
            # candidate file to pass the existing non-link source check.
            linked_source = root / 'linked-candidate.py'
            linked_source.symlink_to(source)
            with self.assertRaises(PermissionError):
                module.run_with_timeout(linked_source, timeout_seconds=10)


if __name__ == '__main__':
    unittest.main()
