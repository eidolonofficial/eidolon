"""Bounded JSON vector data; optional FAISS is rebuilt in memory, never deserialized."""
from __future__ import annotations

from pathlib import Path
from threading import RLock
from typing import List, Optional, Tuple

import numpy as np

from .safety import checked_path, finite, integer, read_json, write_json, MAX_ITEMS


class FAISSIndex:
    """Compatible retrieval API without pickle or native-index loading from disk.

    Historical pickle/native caches are deliberately ignored, not migrated by loading.
    Cognition and Database rebuild their index from authoritative JSON records.
    """

    def __init__(self, dimension: int = 384, index_type: str = 'IP',
                 storage_path: Optional[Path] = None, *, use_faiss: bool = False,
                 embedding_id: str = 'blake2b-token-v1'):
        self.dimension = integer(dimension, 'vector dimension', 1, 4096)
        if index_type not in ('IP', 'L2'):
            raise ValueError('Index type must be IP or L2')
        self.index_type = index_type
        self.storage_path = Path(storage_path) if storage_path else None
        self.embedding_id = embedding_id
        self.lock = RLock()
        self.vectors: dict[int, np.ndarray] = {}
        self.use_faiss = use_faiss
        self.index = None
        self.id_to_idx: dict[int, int] = {}
        self.idx_to_id: dict[int, int] = {}
        self.next_idx = 0
        self._dirty = True
        self._faiss = None
        if use_faiss:
            import faiss
            self._faiss = faiss
        if self.storage_path:
            self.storage_path.mkdir(parents=True, exist_ok=True)
            self._load()

    def _vector(self, vector: np.ndarray) -> np.ndarray:
        result = np.asarray(vector, dtype=np.float32).reshape(-1)
        if result.shape != (self.dimension,) or not np.isfinite(result).all():
            raise ValueError('Vector dimension or finite-value validation failed')
        if self.index_type == 'IP':
            norm = float(np.linalg.norm(result.astype(np.float64)))
            if norm:
                result = result / norm
        return result

    def add(self, node_id: int, vector: np.ndarray) -> None:
        integer(node_id, 'node id', 0, 2**53 - 1)
        checked = self._vector(vector)
        with self.lock:
            if node_id not in self.vectors and (len(self.vectors) >= MAX_ITEMS or
                    (len(self.vectors) + 1) * self.dimension > 16000000):
                raise ValueError('Vector index capacity exceeded')
            self.vectors[node_id] = checked
            self._dirty = True

    def _rebuild(self) -> None:
        if not self.use_faiss or not self._dirty:
            return
        self.index = (self._faiss.IndexFlatIP(self.dimension) if self.index_type == 'IP'
                      else self._faiss.IndexFlatL2(self.dimension))
        ids = sorted(self.vectors)
        self.id_to_idx = {node_id: index for index, node_id in enumerate(ids)}
        self.idx_to_id = dict(enumerate(ids))
        self.next_idx = len(ids)
        if ids:
            self.index.add(np.vstack([self.vectors[node_id] for node_id in ids]))
        self._dirty = False

    def search(self, query_vector: np.ndarray, top_k: int = 5,
               score_threshold: float = 0.0) -> List[Tuple[int, float]]:
        integer(top_k, 'top_k', 0, MAX_ITEMS)
        finite(score_threshold, 'score threshold')
        query = self._vector(query_vector)
        with self.lock:
            if not self.vectors or top_k == 0:
                return []
            if self.use_faiss:
                self._rebuild()
                scores, indices = self.index.search(query.reshape(1, -1), min(top_k, len(self.vectors)))
                found = []
                for score, index in zip(scores[0], indices[0]):
                    if index < 0:
                        continue
                    value = float(score) if self.index_type == 'IP' else -float(np.sqrt(max(0.0, score)))
                    if value >= score_threshold:
                        found.append((self.idx_to_id[int(index)], value))
                return found
            scored = [(node_id, float(np.dot(query, vector)) if self.index_type == 'IP'
                       else -float(np.linalg.norm(query - vector))) for node_id, vector in self.vectors.items()]
            return sorted((item for item in scored if item[1] >= score_threshold),
                          key=lambda item: (-item[1], item[0]))[:top_k]

    def remove(self, node_id: int) -> None:
        with self.lock:
            self.vectors.pop(node_id, None)
            self._dirty = True

    def save(self) -> None:
        if not self.storage_path:
            return
        with self.lock:
            target = checked_path(self.storage_path, 'vectors.v2.json')
            write_json(target, {'version': 2, 'dimension': self.dimension, 'index_type': self.index_type,
                'embedding_id': self.embedding_id,
                'vectors': {str(key): value.tolist() for key, value in self.vectors.items()}})

    def _load(self) -> None:
        target = checked_path(self.storage_path, 'vectors.v2.json')
        if not target.exists():
            return
        payload = read_json(target)
        if (not isinstance(payload, dict) or payload.get('version') != 2
                or payload.get('dimension') != self.dimension or payload.get('index_type') != self.index_type
                or payload.get('embedding_id') != self.embedding_id
                or not isinstance(payload.get('vectors'), dict) or len(payload['vectors']) > MAX_ITEMS):
            raise ValueError('Vector data version, dimension, backend or capacity mismatch; rebuild from source records')
        for key, value in payload['vectors'].items():
            if not key.isascii() or not key.isdecimal() or str(int(key)) != key:
                raise ValueError('Invalid vector id')
            self.add(int(key), np.asarray(value, dtype=np.float32))

    def reset(self) -> None:
        with self.lock:
            self.vectors.clear()
            self.id_to_idx.clear()
            self.idx_to_id.clear()
            self.next_idx = 0
            self.index = None
            self._dirty = True
            if self.storage_path:
                # Do not delete arbitrary files or follow historical cache links.
                checked_path(self.storage_path, 'vectors.v2.json').unlink(missing_ok=True)
