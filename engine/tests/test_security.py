"""Offline security regressions. Fixtures execute only harmless, local Python."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ENGINE = Path(__file__).resolve().parents[1] / 'asi-evolve'
SCRIPTS = ENGINE / 'scripts'
sys.path.insert(0, str(SCRIPTS))
from evolve_core.cli import main_for
from evolve_core.cognition import Cognition
from evolve_core.database import Database
from evolve_core.diff import apply_diff
from evolve_core.embedding import EmbeddingService
from evolve_core.execution import clean_environment, supervise
from evolve_core.file_lock import InterProcessFileLock
from evolve_core.run_state import (approval_path, approve_plan, build_run_dir, default_run_spec,
    ensure_path_allowed, ensure_run_layout, load_run_spec, load_structured_file, plan_for,
    require_evolve_ready, save_run_spec)
from evolve_core.safety import checked_path, read_json, run_directory, sha256, write_json
from evolve_core.sampling_config import validate_custom_sampler_for_workspace
from evolve_core.structures import CognitionItem, Node
from evolve_core.vector_index import FAISSIndex
from evolve_core.algorithms.island import IslandSampler


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='eidolon engine ')
        self.addCleanup(self.temp.cleanup)
        self.workspace = Path(self.temp.name).resolve()
        self.run = build_run_dir(self.workspace, 'test-run')
        ensure_run_layout(self.run)
        self.source = self.workspace / 'candidate.py'
        self.source.write_text('print(1)\n', encoding='utf-8')
        self.judge = self.workspace / 'judge.py'
        self.judge.write_text("import sys,json\nfrom pathlib import Path\nPath(sys.argv[2]).write_text(json.dumps({'success': True, 'score': 1.25}))\n", encoding='utf-8')
        self.spec = default_run_spec()
        self.spec.update(objective='offline regression', stop_conditions=['budget'])
        self.spec['evaluation'].update(core_score='score', script_path='judge.py', timeout_secs=3,
                                       success_criteria=['valid finite score'], execution_mode='trusted-local')
        self.spec['budget'].update(max_rounds=3, patience=0)
        self.spec['mutation_scope'].update(writable_paths=['candidate.py'], primary_targets=['candidate.py'])
        self.spec['cognition']['source_mode'] = 'local'
        save_run_spec(self.run, self.spec)

    def approve(self):
        spec = load_run_spec(self.run)
        approve_plan(self.run, spec, plan_for(self.run, spec)['digest'])
        save_run_spec(self.run, spec)
        return spec

    def cli(self, name, *args):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = main_for(name, list(args))
        return code, stdout.getvalue(), stderr.getvalue()

    def evaluate(self, step='one', **kwargs):
        args = ['run', '--run-dir', str(self.run), '--code-path', 'candidate.py', '--step-name', step]
        for key, value in kwargs.items():
            args += ['--' + key.replace('_', '-'), str(value)]
        return self.cli('eval', *args)


    def test_supervisor_terminates_background_descendants(self):
        # A grandchild must not survive a successful direct child. No external I/O.
        step = self.workspace / 'process-lifetime'; step.mkdir()
        marker = self.workspace / 'descendant-survived.txt'
        worker = self.workspace / 'descendant.py'
        worker.write_text("import time,sys\nfrom pathlib import Path\ntime.sleep(2)\nPath(sys.argv[1]).write_text('survived')\n", encoding='utf-8')
        parent = self.workspace / 'parent.py'
        parent.write_text("import subprocess,sys\nsubprocess.Popen([sys.executable,sys.argv[1],sys.argv[2]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)\n", encoding='utf-8')
        rc, reason = supervise([sys.executable,str(parent),str(worker),str(marker)],self.workspace,step,3)
        self.assertEqual(rc,0)
        import time
        time.sleep(2.25)
        self.assertFalse(marker.exists(),'background descendant escaped evaluator lifetime')

    def test_runtime_source_is_not_a_candidate(self):
        from evolve_core.safety import authority_path
        self.assertTrue(authority_path(ENGINE.parent.parent, SCRIPTS / 'evolve_core/cli.py'))

    def test_unconfirmed_cannot_evaluate(self):
        self.assertNotEqual(self.evaluate()[0], 0)
        self.assertFalse((self.run / 'steps/one').exists())

    def test_exact_approval_and_record_smoke(self):
        self.approve()
        self.assertEqual(self.evaluate()[0], 0)
        code, out, error = self.cli('db','record','--run-dir',str(self.run),'--step-name','one',
                                    '--name','fixture','--code-path','candidate.py')
        self.assertEqual(code, 0, error)
        self.assertEqual(json.loads(out)['node_id'], 0)
        self.assertEqual(self.cli('summary','final','--run-dir',str(self.run))[0], 0)

    def test_confirmation_requires_preview_digest(self):
        code, _, _ = self.cli('brief','normalize','--workspace-root',str(self.workspace),
                              '--run-name','test-run','--confirmed','true')
        self.assertNotEqual(code, 0)
        self.assertFalse(approval_path(self.run).exists())

    def test_spec_file_cannot_self_confirm(self):
        self.spec['approval'] = {'confirmed': True}
        data = self.workspace / 'input.json'; write_json(data, self.spec)
        code, out, _ = self.cli('brief','normalize','--workspace-root',str(self.workspace),
                                '--run-name','test-run','--spec-file',str(data))
        self.assertEqual(code, 0)
        self.assertFalse(json.loads(out)['confirmed'])

    def test_truthy_confirmation_rejected(self):
        for value in ('false', 1, [], {}):
            with self.subTest(value=value):
                self.spec['approval']['confirmed'] = value
                with self.assertRaises(ValueError):
                    save_run_spec(self.run, self.spec)

    def test_changed_judge_invalidates_approval(self):
        self.approve(); self.judge.write_text('# changed\n', encoding='utf-8')
        with self.assertRaises(PermissionError):
            require_evolve_ready(self.run)

    def test_changed_budget_invalidates_approval(self):
        spec = self.approve(); spec['budget']['max_rounds'] += 1
        save_run_spec(self.run, spec)
        with self.assertRaises(PermissionError):
            require_evolve_ready(self.run)

    def test_changed_declared_support_file_invalidates_approval(self):
        support = self.workspace/'support.py'; support.write_text('value=1')
        self.spec['evaluation']['input_paths']=['support.py']; save_run_spec(self.run,self.spec)
        self.approve(); support.write_text('value=2')
        with self.assertRaises(PermissionError): require_evolve_ready(self.run)

    def test_evaluator_overrides_are_not_approval(self):
        self.approve()
        self.assertNotEqual(self.evaluate(timeout=8)[0], 0)
        self.assertFalse((self.run/'steps/one').exists())

    def test_portable_run_and_step_names(self):
        for value in ('../outside', '/absolute', 'CON', 'a/b', 'name.', 'a\\b'):
            with self.subTest(value=value), self.assertRaises((ValueError, PermissionError)):
                build_run_dir(self.workspace, value)
        self.approve()
        self.assertNotEqual(self.evaluate('../escape')[0], 0)
        self.assertFalse((self.run/'escape').exists())

    def test_run_directory_shape_is_checked(self):
        with self.assertRaises(ValueError): run_directory(self.workspace/'ordinary-dir')

    def test_internal_controls_not_writable(self):
        self.approve()
        for name in ('run_spec.yaml','runtime.json','steps/one/results.json','database_data/nodes.json','round_log.jsonl'):
            with self.subTest(name=name), self.assertRaises(PermissionError):
                ensure_path_allowed(self.run,self.run/name,write=True)
        self.assertEqual(ensure_path_allowed(self.run,self.run/'candidates/new.py',write=True),self.run/'candidates/new.py')

    def test_other_run_not_accessible(self):
        with self.assertRaises(PermissionError):
            ensure_path_allowed(self.run,self.workspace/'.evolve_runs/other/data')

    def test_broad_scope_still_protects_judge_and_authority(self):
        (self.workspace/'work').mkdir(); (self.workspace/'work/judge.py').write_bytes(self.judge.read_bytes())
        self.spec['evaluation']['script_path']='work/judge.py'; self.spec['mutation_scope']['writable_paths']=['work']
        save_run_spec(self.run,self.spec)
        with self.assertRaises(PermissionError):
            ensure_path_allowed(self.run,self.workspace/'work/judge.py',write=True)
        with self.assertRaises(PermissionError):
            ensure_path_allowed(self.run,self.workspace/'.eidolon/engine-approvals/fake.json',write=True)

    def test_symlink_and_hardlink_paths_rejected(self):
        target=self.workspace/'target'; target.write_text('not touched')
        alias=self.workspace/'alias'
        try: alias.symlink_to(target)
        except OSError: self.skipTest('OS did not grant symlink creation')
        with self.assertRaises(PermissionError): checked_path(self.workspace,alias)
        alias.unlink(); os.link(target,alias)
        with self.assertRaises(PermissionError): checked_path(self.workspace,alias)

    def test_linked_run_parent_rejected(self):
        alias=self.workspace/'redirect'; alias.mkdir()
        linked=self.workspace/'nested'; linked.mkdir()
        try: (linked/'.evolve_runs').symlink_to(alias, target_is_directory=True)
        except OSError: self.skipTest('OS did not grant symlink creation')
        with self.assertRaises(PermissionError): build_run_dir(linked,'bad')

    def test_yaml_duplicates_and_aliases_rejected(self):
        file=self.workspace/'bad.yaml'
        for text in ('approval: {}\napproval: {}\n','a: &x [*x]\n','a: .nan\n'):
            file.write_text(text)
            with self.assertRaises((ValueError,TypeError)): load_structured_file(file)

    def test_custom_sampler_preview_never_imports(self):
        marker=self.workspace/'executed'
        sampler=self.workspace/'sampler.py'
        sampler.write_text("from pathlib import Path\nPath("+repr(str(marker))+").write_text('bad')\nclass Example:\n def sample(self, nodes, n): return nodes[:n]\n")
        self.spec['sampling'].update(algorithm='custom',custom_sampler_path='sampler.py',custom_sampler_class='Example')
        self.assertEqual(validate_custom_sampler_for_workspace(self.spec,self.workspace),'')
        self.assertFalse(marker.exists())

    def test_finite_score_required(self):
        for value in (float('nan'),float('inf'),-float('inf'),True,'2'):
            with self.subTest(value=value), self.assertRaises(ValueError): Node(score=value)

    def test_existing_step_is_never_reused(self):
        self.approve(); self.assertEqual(self.evaluate()[0],0)
        before=(self.run/'steps/one/results.json').read_bytes()
        self.assertNotEqual(self.evaluate()[0],0)
        self.assertEqual((self.run/'steps/one/results.json').read_bytes(),before)

    def test_failure_cannot_keep_success_result(self):
        self.judge.write_text(self.judge.read_text()+"raise SystemExit(1)\n")
        self.approve(); self.assertNotEqual(self.evaluate()[0],0)
        self.assertIs(read_json(self.run/'steps/one/results.json')['success'],False)

    def test_missing_results_are_failure(self):
        self.judge.write_text('print("no result")\n')
        self.approve(); self.assertNotEqual(self.evaluate()[0],0)

    def test_nan_result_is_failure(self):
        self.judge.write_text("import sys\nfrom pathlib import Path\nPath(sys.argv[2]).write_text('{\"success\":true,\"score\":NaN}')\n")
        self.approve(); self.assertNotEqual(self.evaluate()[0],0)

    def test_timeout_is_failure(self):
        self.judge.write_text('import time\ntime.sleep(5)\n')
        self.spec['evaluation']['timeout_secs']=1; save_run_spec(self.run,self.spec)
        self.approve(); code,out,_=self.evaluate()
        self.assertNotEqual(code,0); self.assertEqual(json.loads(out)['failure_reason'],'timeout')

    def test_output_limit_is_failure(self):
        self.judge.write_text("print('x'*1000000)\n")
        self.approve(); code,out,_=self.evaluate()
        self.assertNotEqual(code,0); self.assertEqual(json.loads(out)['failure_reason'],'output-limit')
        self.assertLessEqual((self.run/'steps/one/eval.stdout').stat().st_size,256*1024)

    def test_budget_is_enforced(self):
        self.spec['budget']['max_rounds']=1; save_run_spec(self.run,self.spec); self.approve()
        self.assertEqual(self.evaluate('one')[0],0)
        self.assertNotEqual(self.evaluate('two')[0],0)
        self.assertFalse((self.run/'steps/two').exists())

    def test_patience_is_enforced(self):
        self.spec['budget']['patience']=1; save_run_spec(self.run,self.spec); self.approve()
        self.assertEqual(self.evaluate('one')[0],0); self.assertEqual(self.evaluate('two')[0],0)
        self.assertNotEqual(self.evaluate('three')[0],0)

    def test_tampered_results_cannot_be_recorded(self):
        self.approve(); self.assertEqual(self.evaluate()[0],0)
        write_json(self.run/'steps/one/results.json',{'success':True,'score':999})
        self.assertNotEqual(self.cli('db','record','--run-dir',str(self.run),'--step-name','one',
            '--name','forged','--code-path','candidate.py')[0],0)

    def test_manual_score_cannot_replace_evaluation(self):
        self.approve(); self.assertEqual(self.evaluate()[0],0)
        self.assertNotEqual(self.cli('db','record','--run-dir',str(self.run),'--step-name','one',
            '--name','forged','--code-path','candidate.py','--score','999')[0],0)

    def test_environment_does_not_forward_credentials(self):
        step=self.run/'steps/env'; step.mkdir()
        with patch.dict(os.environ,{'EXAMPLE_API_KEY':'synthetic-not-a-credential','PYTHONPATH':'/untrusted','LD_PRELOAD':'/untrusted'}):
            env=clean_environment(step)
            self.assertNotIn('EXAMPLE_API_KEY',env); self.assertNotIn('PYTHONPATH',env); self.assertNotIn('LD_PRELOAD',env)

    def test_literal_special_characters_in_candidate_path(self):
        unusual=self.workspace/'name with spaces & quotes.py'; unusual.write_bytes(self.source.read_bytes())
        self.spec['mutation_scope'].update(writable_paths=[unusual.name],primary_targets=[unusual.name])
        save_run_spec(self.run,self.spec);self.approve()
        code,out,error=self.cli('eval','run','--run-dir',str(self.run),'--code-path',unusual.name,'--step-name','literal')
        self.assertEqual(code,0,error)

    def test_embeddings_are_process_deterministic(self):
        code='from evolve_core.embedding import EmbeddingService; import hashlib; print(hashlib.sha256(EmbeddingService().encode("apple apple tree").tobytes()).hexdigest())'
        values=[]
        for seed in ('1','12345'):
            env=dict(os.environ,PYTHONHASHSEED=seed,PYTHONPATH=str(SCRIPTS))
            values.append(subprocess.check_output([sys.executable,'-c',code],env=env,text=True).strip())
        self.assertEqual(values[0],values[1])

    def test_no_automatic_model_download(self):
        with self.assertRaises(ValueError): EmbeddingService(model_name='sentence-transformers/remote-model')
        self.assertEqual(EmbeddingService().encode('x').shape,(1,384))

    def test_legacy_pickle_is_never_loaded(self):
        folder=self.workspace/'vectors';folder.mkdir()
        (folder/'metadata.pkl').write_bytes(b'not a pickle; must be ignored')
        (folder/'fallback.pkl').write_bytes(b'not a pickle; must be ignored')
        index=FAISSIndex(dimension=3,storage_path=folder)
        self.assertEqual(index.search([1,0,0],3),[])

    def test_vector_upsert_delete_and_reload(self):
        import numpy as np
        folder=self.workspace/'vectors'
        index=FAISSIndex(dimension=3,storage_path=folder)
        index.add(1,np.array([1,0,0]));index.add(1,np.array([0,1,0]));index.add(2,np.array([1,0,0]));index.remove(2);index.save()
        loaded=FAISSIndex(dimension=3,storage_path=folder)
        self.assertEqual([value[0] for value in loaded.search([0,1,0],5)],[1])
        with self.assertRaises(ValueError): FAISSIndex(dimension=4,storage_path=folder)

    def test_cognition_separate_instances_refresh(self):
        folder=self.workspace/'cognition'
        one=Cognition(folder);two=Cognition(folder)
        one.add(CognitionItem('first'));two.add(CognitionItem('second'))
        self.assertEqual(len(one),2)
        self.assertEqual(len(two),2)

    def test_cognition_batch_failure_is_atomic(self):
        folder=self.workspace/'cognition';store=Cognition(folder);store.add(CognitionItem('original'))
        bad=CognitionItem('bad');bad.metadata={'bad':float('nan')}
        with self.assertRaises(ValueError):store.add_batch([CognitionItem('not committed'),bad])
        self.assertEqual(len(Cognition(folder)),1)

    def test_cross_process_cognition_has_no_lost_updates(self):
        folder=self.workspace/'cognition'
        code='from evolve_core.cognition import Cognition; from evolve_core.structures import CognitionItem; from pathlib import Path; import sys; c=Cognition(Path(sys.argv[1])); [c.add(CognitionItem(sys.argv[2]+str(i))) for i in range(6)]'
        env=dict(os.environ,PYTHONPATH=str(SCRIPTS))
        children=[subprocess.Popen([sys.executable,'-c',code,str(folder),str(i)],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE) for i in range(3)]
        for child in children:
            out,err=child.communicate(timeout=30);self.assertEqual(child.returncode,0,err.decode())
        self.assertEqual(len(Cognition(folder)),18)

    def test_lock_sentinel_does_not_grow(self):
        path=self.workspace/'state.lock'
        for _ in range(10):
            with InterProcessFileLock(path):pass
        self.assertEqual(path.stat().st_size,1)

    def test_ambiguous_diff_rejected(self):
        with self.assertRaises(ValueError):apply_diff('same\nsame','<<<<<<< SEARCH\nsame\n=======\nother\n>>>>>>> REPLACE')

    def test_island_sampling_terminates_with_skewed_weights(self):
        sampler=IslandSampler(num_islands=1,exploration_ratio=0,exploitation_ratio=0)
        nodes=[Node(id=i,name=str(i),score=1e200 if i==0 else 0) for i in range(4)]
        for node in nodes:sampler.on_node_added(node)
        self.assertEqual(len(sampler.sample(nodes,4)),4)

    def test_demo_validates_shape_and_nonfinite_values(self):
        import numpy as np
        spec=importlib.util.spec_from_file_location('packing_demo',ENGINE/'experiments/circle_packing_demo/evaluator.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        self.assertFalse(module.validate_packing(np.zeros((1,2)),np.zeros(1)))
        self.assertFalse(module.validate_packing(np.full((26,2),float('inf')),np.zeros(26)))
        self.assertTrue(module.validate_packing(np.full((26,2),0.5),np.zeros(26)))

    def test_demo_json_subprocess_transport(self):
        spec=importlib.util.spec_from_file_location('packing_demo2',ENGINE/'experiments/circle_packing_demo/evaluator.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        source=self.workspace/"candidate's & file.py"
        source.write_text('import numpy as np\ndef construct_packing():\n return np.full((26,2),0.5),np.zeros(26),0.0\n')
        centers,radii,total=module.run_with_timeout(source,timeout_seconds=5)
        self.assertEqual(centers.shape,(26,2));self.assertEqual(total,0)


if __name__ == '__main__':
    unittest.main()
