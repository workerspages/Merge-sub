const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const os = require('os');
const crypto = require('crypto');
// [修改] 确保 child_process 同时引入了 exec 和 execSync
const { exec, execSync } = require('child_process'); 
const session = require('express-session');

// --- 环境变量与常量定义 ---
const USERNAME = process.env.USERNAME || 'admin';
const PASSWORD = process.env.PASSWORD || 'admin';
const API_URL = process.env.API_URL || 'https://sublink.eooce.com';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const SUB_TOKEN = process.env.SUB_TOKEN || generateRandomString();

// ... (文件中间的所有代码，从 let subscriptions = []; 到 app.get('/', ...); 都不需要任何修改) ...

// === 为了节省篇幅，中间未变化的代码已省略，请保持您文件中的这部分不变 ===

// --- 首页路由 ---
app.get('/', checkAuth, function(req, res) {
    // 只有通过认证的用户才能访问主管理页面
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ... (所有核心功能函数、辅助函数和数据持久化函数都保持不变) ...


// --- 服务器启动 (这是核心修改区域) ---
async function startServer() {
    try {
        await ensureDataDir();
        await initializeCredentialsFile();
        credentials = await loadCredentials();
        await initializeDataFile();
        
        // 1. 让 Node.js 应用先监听端口
        app.listen(PORT, () => {
            console.log(`Node.js server is running and listening on port ${PORT}`);
            console.log(`Admin page available at http://localhost:${PORT}/`);
            console.log(`Subscription route is /${SUB_TOKEN}`);

            // 2. [新增] 在 Node.js 成功启动后，才通过子进程的方式来启动 Nginx
            console.log('Attempting to start Nginx...');
            const nginx = exec('nginx -g "daemon off;"');

            // 监听 Nginx 子进程的标准输出，并打印到主日志中 (这对于调试非常有用)
            nginx.stdout.on('data', (data) => {
                // 使用 .trim() 移除末尾的换行符，使日志更整洁
                process.stdout.write(`[NGINX_STDOUT] ${data.toString().trim()}\n`);
            });

            // 监听 Nginx 子进程的错误输出
            nginx.stderr.on('data', (data) => {
                process.stderr.write(`[NGINX_STDERR] ${data.toString().trim()}\n`);
            });

            // 监听 Nginx 进程退出事件
            nginx.on('close', (code) => {
                console.log(`Nginx process exited with code ${code}`);
                // 如果 Nginx 意外退出，可以选择也关闭 Node.js 应用
                if (code !== 0) {
                    console.log('Nginx exited unexpectedly. Shutting down Node.js server.');
                    process.exit(1);
                }
            });
        });
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
}

startServer();
