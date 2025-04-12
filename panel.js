// 连接到background page
const port = chrome.runtime.connect({
  name: "devtools-panel"
});

// 监听来自content script和background script的消息
port.onMessage.addListener((message) => {
  addLog(message);
});

// 添加日志到面板
function addLog(message) {
  const logDiv = document.getElementById('log');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  if (message.type === 'error') {
    entry.className += ' error';
  } else if (message.type === 'success') {
    entry.className += ' success';
  }
  
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message.text}`;
  logDiv.appendChild(entry);
  logDiv.scrollTop = logDiv.scrollHeight;
}

// 初始化
addLog({
  type: 'info',
  text: 'Debug panel initialized'
}); 