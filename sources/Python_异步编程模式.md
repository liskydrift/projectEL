# Python 异步编程模式

## 事件循环 (Event Loop)

asyncio.run() 是最高层入口，负责创建事件循环、运行协程、关闭循环。

## 协程 (Coroutine)

定义：async def
调用：await

协程必须被事件循环调度才能执行。

## 关键概念

### awaitable
可等待对象：协程、Task、Future。

### Task
使用 asyncio.create_task() 将协程包装为 Task，实现并发执行。

### Future
底层异步结果容器，通常不直接使用。

## 常见模式

### 并发收集结果
```python
async def main():
    tasks = [asyncio.create_task(fetch(url)) for url in urls]
    results = await asyncio.gather(*tasks)
```

### 超时控制
```python
async with asyncio.timeout(5):
    result = await fetch_data()
```

### 异步迭代器
```python
async for item in async_generator():
    process(item)
```
