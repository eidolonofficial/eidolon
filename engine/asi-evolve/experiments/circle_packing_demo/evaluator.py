"""
Evaluator for circle packing example (n=26) with improved timeout handling
"""

import importlib.util
import numpy as np
import time
import os
import signal
import subprocess
import tempfile
import traceback
import sys
import json
from pathlib import Path


class TimeoutError(Exception):
    pass


def timeout_handler(signum, frame):
    """Handle timeout signal"""
    raise TimeoutError("Function execution timed out")


def validate_packing(centers, radii):
    """
    Validate that circles don't overlap and are inside the unit square

    Args:
        centers: np.array of shape (n, 2) with (x, y) coordinates
        radii: np.array of shape (n) with radius of each circle

    Returns:
        True if valid, False otherwise
    """
    try:
        centers = np.asarray(centers, dtype=np.float64)
        radii = np.asarray(radii, dtype=np.float64)
    except (TypeError, ValueError):
        return False
    if centers.shape != (26, 2) or radii.shape != (26,) or not np.isfinite(centers).all() or not np.isfinite(radii).all():
        return False
    n = 26

    # Check for NaN values
    if np.isnan(centers).any():
        print("NaN values detected in circle centers")
        return False

    if np.isnan(radii).any():
        print("NaN values detected in circle radii")
        return False

    # Check if radii are nonnegative and not nan
    for i in range(n):
        if radii[i] < 0:
            print(f"Circle {i} has negative radius {radii[i]}")
            return False
        elif np.isnan(radii[i]):
            print(f"Circle {i} has nan radius")
            return False

    # Check if circles are inside the unit square
    for i in range(n):
        x, y = centers[i]
        r = radii[i]
        if x - r < -1e-6 or x + r > 1 + 1e-6 or y - r < -1e-6 or y + r > 1 + 1e-6:
            print(f"Circle {i} at ({x}, {y}) with radius {r} is outside the unit square")
            return False

    # Check for overlaps
    for i in range(n):
        for j in range(i + 1, n):
            dist = np.sqrt(np.sum((centers[i] - centers[j]) ** 2))
            if dist < radii[i] + radii[j] - 1e-6:  # Allow for tiny numerical errors
                print(f"Circles {i} and {j} overlap: dist={dist}, r1+r2={radii[i]+radii[j]}")
                return False

    return True


# Fixed worker source: paths are arguments, never interpolated into Python code.
_WORKER = r"""
import sys, json, types
from pathlib import Path
import numpy as np
source, output = map(Path, sys.argv[1:])
code = source.read_bytes()
if len(code) > 4 * 1024 * 1024:
    raise ValueError('Candidate is too large')
program = types.ModuleType('candidate')
program.__file__ = str(source)
exec(compile(code, str(source), 'exec'), program.__dict__)
centers, radii, reported = program.construct_packing()
centers = np.asarray(centers, dtype=np.float64)
radii = np.asarray(radii, dtype=np.float64)
if centers.shape != (26, 2) or radii.shape != (26,):
    raise ValueError('Invalid packing dimensions')
output.write_text(json.dumps({'centers': centers.tolist(), 'radii': radii.tolist(),
                             'sum_radii': float(reported)}, allow_nan=False), encoding='utf-8')
"""


def run_with_timeout(program_path, timeout_seconds=20):
    """Run explicitly trusted candidate code; JSON transport, bounded logs, no pickle.

    A subprocess is not a filesystem/network sandbox. Use a disposable external
    sandbox for unknown candidates, even though their result shapes are validated.
    """
    runtime = Path(__file__).resolve().parents[2] / 'scripts'
    if str(runtime) not in sys.path:
        sys.path.insert(0, str(runtime))
    from evolve_core.execution import supervise
    from evolve_core.safety import atomic_write, bounded_bytes, read_json
    source = Path(program_path).absolute()
    bounded_bytes(source, 4 * 1024 * 1024)
    with tempfile.TemporaryDirectory(prefix='evolve-packing-') as directory:
        # Canonicalize only the fresh directory we created. OS temp roots may
        # use /var aliases or Windows short names; candidate paths stay checked.
        step = Path(directory).resolve(strict=True)
        worker, output = step / 'worker.py', step / 'packing.json'
        atomic_write(worker, _WORKER)
        rc, reason = supervise([sys.executable, '-I', str(worker), str(source), str(output)],
                               source.parent, step, timeout_seconds,
                               isolated_group=os.environ.get('EIDOLON_SUPERVISED') != '1')
        if rc != 0 or reason:
            raise TimeoutError('Packing candidate did not complete successfully')
        value = read_json(output, 32768)
        if not isinstance(value, dict):
            raise ValueError('Invalid packing payload')
        centers = np.asarray(value['centers'], dtype=np.float64)
        radii = np.asarray(value['radii'], dtype=np.float64)
        if centers.shape != (26, 2) or radii.shape != (26,) or not np.isfinite(centers).all() or not np.isfinite(radii).all():
            raise ValueError('Invalid packing dimensions or non-finite coordinates')
        reported = float(value['sum_radii'])
        if not np.isfinite(reported):
            raise ValueError('Non-finite reported sum')
        return centers, radii, reported


def evaluate(program_path):
    """
    Evaluate the program by running it once and checking the sum of radii

    Args:
        program_path: Path to the program file

    Returns:
        Dictionary of metrics
    """
    # Target value from the paper
    TARGET_VALUE = 2.635  # AlphaEvolve result for n=26

    try:
        # For constructor-based approaches, a single evaluation is sufficient
        # since the result is deterministic
        start_time = time.time()

        # Use subprocess to run with timeout
        centers, radii, reported_sum = run_with_timeout(
            program_path, timeout_seconds=600  # Single timeout
        )

        end_time = time.time()
        eval_time = end_time - start_time

        # Ensure centers and radii are numpy arrays
        if not isinstance(centers, np.ndarray):
            centers = np.array(centers)
        if not isinstance(radii, np.ndarray):
            radii = np.array(radii)

        # Check for NaN values before validation
        if np.isnan(centers).any() or np.isnan(radii).any():
            print("NaN values detected in solution")
            return {
                "sum_radii": 0.0,
                "target_ratio": 0.0,
                "validity": 0.0,
                "eval_time": float(time.time() - start_time),
                "combined_score": 0.0,
            }

        # Validate solution
        valid = validate_packing(centers, radii)

        # Check shape and size
        shape_valid = centers.shape == (26, 2) and radii.shape == (26,)
        if not shape_valid:
            print(
                f"Invalid shapes: centers={centers.shape}, radii={radii.shape}, expected (26, 2) and (26,)"
            )
            valid = False

        # Calculate sum
        sum_radii = np.sum(radii) if valid else 0.0

        # Make sure reported_sum matches the calculated sum
        if abs(sum_radii - reported_sum) > 1e-6:
            print(f"Warning: Reported sum {reported_sum} doesn't match calculated sum {sum_radii}")

        # Target ratio (how close we are to the target)
        target_ratio = sum_radii / TARGET_VALUE if valid else 0.0

        # Validity score
        validity = 1.0 if valid else 0.0

        # Combined score - higher is better
        # Use exponential weighting: closer to target gets exponentially higher reward
        # This makes each small improvement near the target more valuable
        if validity > 0:
            # exp(target_ratio) - 1, normalized to [0, 1] range
            # When target_ratio = 0: score = 0
            # When target_ratio = 1: score = 1
            combined_score = sum_radii
        else:
            combined_score = 0.0

        print(
            f"Evaluation: valid={valid}, sum_radii={sum_radii:.6f}, target={TARGET_VALUE}, ratio={target_ratio:.6f}, time={eval_time:.2f}s"
        )

        return {
            "sum_radii": float(sum_radii),
            "target_ratio": float(target_ratio),
            "validity": float(validity),
            "eval_time": float(eval_time),
            "combined_score": float(combined_score),
        }

    except Exception as e:
        print(f"Evaluation failed completely: {str(e)}")
        traceback.print_exc()
        return {
            "sum_radii": 0.0,
            "target_ratio": 0.0,
            "validity": 0.0,
            "eval_time": 0.0,
            "combined_score": 0.0,
        }


# Stage-based evaluation for cascade evaluation
def evaluate_stage1(program_path):
    """
    First stage evaluation - quick validation check
    """
    try:
        # Use the simplified subprocess approach
        try:
            centers, radii, sum_radii = run_with_timeout(program_path, timeout_seconds=600)

            # Ensure centers and radii are numpy arrays
            if not isinstance(centers, np.ndarray):
                centers = np.array(centers)
            if not isinstance(radii, np.ndarray):
                radii = np.array(radii)

            # Validate solution (shapes and constraints)
            shape_valid = centers.shape == (26, 2) and radii.shape == (26,)
            if not shape_valid:
                print(f"Invalid shapes: centers={centers.shape}, radii={radii.shape}")
                return {"validity": 0.0, "error": "Invalid shapes"}

            valid = validate_packing(centers, radii)

            # Calculate sum
            actual_sum = np.sum(radii) if valid else 0.0

            # Target from paper
            target = 2.635

            # Exponential combined score for stage 1, normalized to [0, 1]
            # Use exponential weighting to reward getting closer to target
            if valid:
                target_ratio = actual_sum / target
                combined_score = (np.exp(target_ratio) - 1) / (np.e - 1)
            else:
                combined_score = 0.0

            # Return evaluation metrics
            return {
                "validity": 1.0 if valid else 0.0,
                "sum_radii": float(actual_sum),
                "target_ratio": float(actual_sum / target if valid else 0.0),
                "combined_score": float(combined_score),
            }

        except TimeoutError as e:
            print(f"Stage 1 evaluation timed out: {e}")
            return {"validity": 0.0, "combined_score": 0.0, "error": "Timeout"}
        except Exception as e:
            print(f"Stage 1 evaluation failed: {e}")
            print(traceback.format_exc())
            return {"validity": 0.0, "combined_score": 0.0, "error": str(e)}

    except Exception as e:
        print(f"Stage 1 evaluation failed completely: {e}")
        print(traceback.format_exc())
        return {"validity": 0.0, "combined_score": 0.0, "error": str(e)}


def evaluate_stage2(program_path):
    """
    Second stage evaluation - full evaluation
    """
    # Full evaluation as in the main evaluate function
    return evaluate(program_path)


if __name__ == "__main__":
    """
    Command-line interface for Evolve framework
    Usage: python evaluator.py <code_file> <output_json>
    """
    import json
    
    if len(sys.argv) != 3:
        print("Usage: python evaluator.py <code_file> <output_json>")
        sys.exit(1)
    
    code_file = sys.argv[1]
    output_file = sys.argv[2]
    
    result = evaluate(code_file)
    
    # Add framework compatibility fields
    result["success"] = result.get("validity", 0.0) > 0
    result["score"] = result.get("combined_score", 0.0)
    result["eval_score"] = result.get("combined_score", 0.0)
    result["complexity"] = len(open(code_file).read()) if os.path.exists(code_file) else 0
    
    # Write results to JSON file
    with open(output_file, 'w') as f:
        json.dump(result, f, indent=2, allow_nan=False)
    
    # Print summary
    if result.get("success", False):
        print(f"[OK] Valid packing: sum_radii = {result['sum_radii']:.6f}")
        print(f"  Target ratio: {result['target_ratio']:.6f}")
        print(f"  Combined score: {result['combined_score']:.6f}")
    else:
        error_msg = result.get("error", "Invalid packing")
        print(f"[FAIL] Invalid packing: {error_msg}")
