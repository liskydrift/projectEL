# C++ STL 容器参考

## 序列容器

### vector
动态数组，支持随机访问。在末尾插入/删除为摊还 O(1)，在中间为 O(n)。

### deque
双端队列，支持在首尾快速插入/删除（O(1)），随机访问 O(1)。

### list
双向链表，支持在任意位置常数时间插入/删除，但不支持随机访问。

## 关联容器

### set / multiset
基于红黑树的有序集合，查找/插入/删除 O(log n)。multiset 允许重复元素。

### map / multimap
基于红黑树的有序键值对集合，查找/插入/删除 O(log n)。

## 无序关联容器 (C++11)

### unordered_set / unordered_map
基于哈希表，平均 O(1) 查找/插入/删除，最坏 O(n)。

## 容器适配器

### stack
LIFO，默认基于 deque。

### queue
FIFO，默认基于 deque。

### priority_queue
最大堆，默认基于 vector。
