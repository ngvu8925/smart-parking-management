"""
Asynchronous In-Memory Event Bus for internal module decoupling
"""
import asyncio
import logging
from typing import Callable, Dict, List, Any

logger = logging.getLogger("EventBus")


class AsyncEventBus:
    def __init__(self):
        self._subscribers: Dict[str, List[Callable[[Any], Any]]] = {}

    def subscribe(self, event_type: str, callback: Callable[[Any], Any]):
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(callback)

    def unsubscribe(self, event_type: str, callback: Callable[[Any], Any]):
        if event_type in self._subscribers and callback in self._subscribers[event_type]:
            self._subscribers[event_type].remove(callback)

    async def emit(self, event_type: str, data: Any = None):
        if event_type not in self._subscribers:
            return

        for callback in self._subscribers[event_type]:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(data)
                else:
                    callback(data)
            except Exception as e:
                logger.error("Error in subscriber for event '%s': %s", event_type, e, exc_info=True)


# Global event bus singleton
bus = AsyncEventBus()
