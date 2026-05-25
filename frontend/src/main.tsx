import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 注意：故意不使用 <React.StrictMode>。
// StrictMode 在开发模式下会双重执行 useEffect（mount → unmount → re-mount），
// 这与 Socket.io 的长连接生命周期产生根本性冲突——
// 导致前端同时建立两个 Socket 连接，每个 text_delta 事件被处理两次，
// 最终造成 AI 输出出现"口吃/重复"现象（如"查看了查看了"）。
ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);
