"""Atomic, process-serialized cognition with text as the only source of truth."""
from __future__ import annotations

import copy
import uuid
from contextlib import contextmanager
from pathlib import Path
from threading import RLock

from .embedding import EmbeddingService
from .file_lock import InterProcessFileLock
from .safety import MAX_ITEMS, atomic_write, canonical, checked_path, integer, read_json
from .structures import CognitionItem
from .vector_index import FAISSIndex


class Cognition:
    def __init__(self, storage_dir: Path, embedding_model: str | None = None,
                 embedding_dim: int = 384, retrieval_top_k: int = 5,
                 score_threshold: float = 0.3, faiss_index_type: str = 'IP'):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        checked_path(self.storage_dir.parent.resolve(), self.storage_dir)
        self.lock = RLock()
        self.retrieval_top_k = integer(retrieval_top_k, 'retrieval_top_k', 1, MAX_ITEMS)
        self.score_threshold = score_threshold
        self.embedding = EmbeddingService(model_name=embedding_model, dimension=embedding_dim)
        self.index_type = faiss_index_type
        self.items = {}
        with self._guard():
            pass

    @contextmanager
    def _guard(self):
        with self.lock, InterProcessFileLock(self.storage_dir / '.cognition.lock'):
            self._load()
            yield

    def add(self, item: CognitionItem) -> str:
        return self.add_batch([item])[0]

    def add_batch(self, items):
        if not isinstance(items, list) or len(items) > MAX_ITEMS:
            raise ValueError('Invalid cognition batch')
        with self._guard():
            updated = copy.deepcopy(self.items)
            ids = []
            for item in items:
                item = CognitionItem.from_dict(copy.deepcopy(item.to_dict()))
                item.id = item.id or str(uuid.uuid4())
                updated[item.id] = item
                ids.append(item.id)
            if len(updated) > MAX_ITEMS:
                raise ValueError('Cognition capacity exceeded')
            # Publish once: failure never persists a partial batch.
            atomic_write(self.storage_dir / 'cognition.json', canonical({
                'version': 2, 'items': {key: item.to_dict() for key, item in updated.items()}
            }))
            self.items = updated
            return ids

    def search(self, query, top_k=None):
        return [item for item, _ in self.retrieve(query, top_k)]

    def retrieve(self, query, top_k=None, score_threshold=None):
        n = self.retrieval_top_k if top_k is None else integer(top_k, 'top_k', 1, MAX_ITEMS)
        threshold = self.score_threshold if score_threshold is None else score_threshold
        with self._guard():
            # Do not load pickles, native caches, or stale cross-file ID mappings.
            index = FAISSIndex(dimension=self.embedding.dimension, index_type=self.index_type,
                               embedding_id=self.embedding.fingerprint)
            ordered = list(self.items.values())
            for i, item in enumerate(ordered):
                if item.content:
                    index.add(i, self.embedding.encode(item.content))
            return [(copy.deepcopy(ordered[i]), score) for i, score in
                    index.search(self.embedding.encode(query), n, threshold)]

    def get_all(self):
        with self._guard():
            return copy.deepcopy(list(self.items.values()))

    def reset(self):
        with self._guard():
            atomic_write(self.storage_dir / 'cognition.json', canonical({'version': 2, 'items': {}}))
            self.items = {}

    def _load(self):
        path = self.storage_dir / 'cognition.json'
        self.items = {}
        if not path.exists():
            return
        raw = read_json(path)
        entries = raw.get('items') if isinstance(raw, dict) else None
        if not isinstance(entries, dict) or len(entries) > MAX_ITEMS:
            raise ValueError('Invalid cognition state')
        for key, value in entries.items():
            item = CognitionItem.from_dict(value)
            if not isinstance(key, str) or not key or len(key) > 200 or item.id not in (None, key):
                raise ValueError('Invalid cognition identity')
            item.id = key
            self.items[key] = item

    def __len__(self):
        return len(self.get_all())
