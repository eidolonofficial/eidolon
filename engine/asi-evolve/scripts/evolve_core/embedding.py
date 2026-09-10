"""Deterministic, offline-by-default embeddings with explicit local-model opt-in."""
from __future__ import annotations

import hashlib
import math
from pathlib import Path
import re
from typing import List, Union

import numpy as np

from .safety import checked_path, integer


class EmbeddingService:
    """Hash tokens stably across processes; never discover or download a model implicitly."""

    def __init__(self, model_name: str | None = None, device: str = 'cpu', dimension: int = 384):
        self.dimension = integer(dimension, 'embedding dimension', 1, 4096)
        self.model = None
        self.fingerprint = 'blake2b-token-v1:' + str(self.dimension)
        if model_name is not None:
            model_path = Path(model_name)
            if not model_path.is_absolute() or not model_path.is_dir() or model_path.is_symlink():
                raise ValueError('Optional models require an explicitly provisioned absolute local directory')
            model_path = model_path.resolve(strict=True)
            digest = hashlib.sha256()
            for file in sorted(model_path.rglob('*')):
                checked_path(model_path, file)
                if file.is_file():
                    digest.update(file.relative_to(model_path).as_posix().encode('utf-8') + b'\0')
                    with file.open('rb') as handle:
                        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                            digest.update(chunk)
            # Optional imports happen only after explicit local-model selection.
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(str(model_path), device=device,
                local_files_only=True, trust_remote_code=False, model_kwargs={'use_safetensors': True})
            self.dimension = integer(self.model.get_sentence_embedding_dimension(), 'model dimension', 1, 4096)
            self.fingerprint = 'local-safetensors:' + digest.hexdigest()

    def encode(self, texts: Union[str, List[str]], normalize: bool = True) -> np.ndarray:
        if isinstance(texts, str):
            texts = [texts]
        if not isinstance(texts, list) or any(not isinstance(text, str) for text in texts):
            raise ValueError('Embedding input must be text or a list of text values')
        if not texts:
            return np.empty((0, self.dimension), dtype=np.float32)
        if self.model is not None:
            vectors = np.asarray(self.model.encode(texts, normalize_embeddings=normalize,
                show_progress_bar=False), dtype=np.float32)
        else:
            vectors = np.vstack([self._fallback_encode_one(text) for text in texts]).astype(np.float32)
            if normalize:
                vectors = self._normalize(vectors)
        if vectors.shape != (len(texts), self.dimension) or not np.isfinite(vectors).all():
            raise ValueError('Embedding backend returned an invalid shape or non-finite values')
        return vectors

    def get_dimension(self) -> int:
        return self.dimension

    def _fallback_encode_one(self, text: str) -> np.ndarray:
        vector = np.zeros(self.dimension, dtype=np.float32)
        for token in re.findall(r'[A-Za-z0-9_]+', text.lower()):
            # Python hash() is randomized per process and cannot back a persisted index.
            digest = hashlib.blake2b(token.encode('utf-8'), digest_size=16, person=b'eidolon-token-v1').digest()
            index = int.from_bytes(digest[:8], 'big') % self.dimension
            sign = -1.0 if digest[8] & 1 else 1.0
            vector[index] += sign * (1.0 + math.log1p(len(token)))
        return vector

    @staticmethod
    def _normalize(vectors: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return vectors / norms
