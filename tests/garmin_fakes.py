"""
In-memory stand-ins for Firestore and firestore_data_service, for Garmin
import/sync tests. Supports the calls the Garmin services make: collection /
document / set / update / delete / where(==) / limit / stream.
"""

from backend.models import WorkoutSession, WorkoutTemplate
from backend.models.cardio import CardioSession


class _Doc:
    def __init__(self, store, path):
        self.store, self.path, self.id = store, path, path[-1]

    def get(self):
        return _Snap(self.id, self.store.get(self.path))

    def set(self, data):
        self.store[self.path] = dict(data)

    def update(self, data):
        if self.path not in self.store:
            raise KeyError(self.path)
        self.store[self.path].update(data)

    def delete(self):
        self.store.pop(self.path, None)

    def collection(self, name):
        return _Col(self.store, self.path + (name,))


class _Snap:
    def __init__(self, id_, data):
        self.id, self._data = id_, data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class _Col:
    def __init__(self, store, path, filters=(), limit=None):
        self.store, self.path, self.filters, self._limit = store, path, filters, limit

    def document(self, id_):
        return _Doc(self.store, self.path + (id_,))

    def where(self, field, op, value):
        return _Col(self.store, self.path, self.filters + ((field, value),), self._limit)

    def limit(self, n):
        return _Col(self.store, self.path, self.filters, n)

    def stream(self):
        out = []
        for path, data in self.store.items():
            if path[:-1] == self.path and all(data.get(f) == v for f, v in self.filters):
                out.append(_Snap(path[-1], data))
        return out[: self._limit] if self._limit else out


class FakeDB:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return _Col(self.store, (name,))


class FakeFDS:
    """The subset of firestore_data_service the import uses."""

    def __init__(self):
        self.db = FakeDB()

    def _col(self, uid, name):
        return self.db.collection("users").document(uid).collection(name)

    async def get_user_workouts(self, uid, limit=50):
        return [WorkoutTemplate(**s.to_dict()) for s in self._col(uid, "workouts").stream()]

    async def get_workout(self, uid, wid):
        snap = self._col(uid, "workouts").document(wid).get()
        return WorkoutTemplate(**snap.to_dict()) if snap.exists else None

    async def create_workout(self, uid, req):
        w = WorkoutTemplate(name=req.name, description=req.description, exercise_groups=req.exercise_groups,
                            sections=req.sections, workout_type=req.workout_type)
        self._col(uid, "workouts").document(w.id).set(w.model_dump())
        return w

    async def update_workout(self, uid, wid, req):
        self._col(uid, "workouts").document(wid).update(req.model_dump(exclude_unset=True))

    async def delete_workout(self, uid, wid):
        self._col(uid, "workouts").document(wid).delete()
        return True

    async def get_user_sessions(self, uid, limit=20):
        return [WorkoutSession(**s.to_dict()) for s in self._col(uid, "workout_sessions").stream()]

    async def get_user_cardio_sessions(self, uid, limit=20):
        return [CardioSession(**s.to_dict()) for s in self._col(uid, "cardio_sessions").stream()]

    async def create_and_complete_workout_session(self, uid, req):
        data = req.model_dump()
        data["exercises_performed"] = [e.model_dump() for e in req.exercises_performed]
        s = WorkoutSession(**{**data, "status": "completed"})
        self._col(uid, "workout_sessions").document(s.id).set(s.model_dump())
        return s

    async def create_cardio_session(self, uid, req):
        s = CardioSession(**req.model_dump())
        self._col(uid, "cardio_sessions").document(s.id).set(s.model_dump())
        return s


