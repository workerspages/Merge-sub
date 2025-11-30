const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const session = require('express-session');

const USERNAME = process.env.USERNAME || 'admin';
const PASSWORD = process.env.PASSWORD || 'admin';
const API_URL = process.env.API_URL || 'https://sublink.eooce.com';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');

let credentials = {};
let subscriptions = [];
// nodes 现在存储对象数组: [{ alias: "备注", url: "节点链接" }, ...]
let nodes = [];

const SUB_TOKEN = process.env.SUB_TOKEN || 'your_secret_token_here';

async function ensureDataDir() { try { await fs.access(DATA_DIR); } catch { await fs.mkdir(DATA_DIR, { recursive: true }); } }
async function initializeCredentialsFile() { try { await fs.access(CREDENTIALS_FILE); } catch { await fs.writeFile(CREDENTIALS_FILE, JSON.stringify({ username: USERNAME, password: PASSWORD }, null, 2)); } }

// 初始化数据文件，确保结构正确
async function initializeDataFile() { 
    try { 
        const data = await fs.readFile(DATA_FILE, 'utf8'); 
        const parsed = JSON.parse(data); 
        subscriptions = parsed.subscriptions || []; 
        
        // 兼容性处理：如果读取到的是字符串或字符串数组，转换为对象结构
        if (Array.isArray(parsed.nodes)) {
            nodes = parsed.nodes.map(n => typeof n === 'string' ? { alias: '', url: n } : n);
        } else if (typeof parsed.nodes === 'string') {
            nodes = parsed.nodes.split('\n').filter(n => n.trim()).map(n => ({ alias: '', url: n.trim() }));
        } else {
            nodes = [];
        }
    } catch { 
        await fs.writeFile(DATA_FILE, JSON.stringify({ subscriptions: [], nodes: [] }, null, 2)); 
        subscriptions = []; 
        nodes = []; 
    } 
}

async function loadCredentials() { try { await initializeCredentialsFile(); const data = await fs.readFile(CREDENTIALS_FILE, 'utf8'); return JSON.parse(data); } catch { return { username: USERNAME, password: PASSWORD }; } }
async function saveCredentials(creds) { try { await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2)); return true; } catch { return false; } }

// 加载数据：处理旧格式兼容
async function loadData() { 
    try { 
        const data = await fs.readFile(DATA_FILE, 'utf8'); 
        const parsed = JSON.parse(data); 
        
        if (Array.isArray(parsed.subscriptions)) { 
            subscriptions = parsed.subscriptions.map(sub => { 
                if (typeof sub === 'string') { return { url: sub, alias: '' }; } 
                return sub; 
            }); 
        } else { 
            subscriptions = []; 
        } 
        
        // 核心修改：确保 nodes 总是对象数组
        if (Array.isArray(parsed.nodes)) {
            nodes = parsed.nodes.map(n => typeof n === 'string' ? { alias: '', url: n } : n);
        } else if (typeof parsed.nodes === 'string') {
            nodes = parsed.nodes.split('\n').filter(n => n.trim()).map(n => ({ alias: '', url: n.trim() }));
        } else {
            nodes = [];
        }
    } catch { 
        subscriptions = []; 
        nodes = []; 
    } 
}

// 保存数据：保存完整的对象结构
async function saveData(subs, nds) { 
    try { 
        const data = { 
            subscriptions: Array.isArray(subs) ? subs : [], 
            nodes: Array.isArray(nds) ? nds : [] 
        }; 
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2)); 
        subscriptions = data.subscriptions; 
        nodes = data.nodes; 
    } catch (error) { 
        throw error; 
    } 
}

app.use(session({ secret: crypto.randomBytes(64).toString('hex'), resave: false, saveUninitialized: false, cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 } }));
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const checkAuth = (req, res, next) => { if (req.session.user) { next(); } else { if (req.path.startsWith('/admin/')) return res.status(401).json({ error: 'Unauthorized' }); res.redirect('/login.html'); } };

app.post('/login', async (req, res) => { const { username, password } = req.body; if (username === credentials.username && password === credentials.password) { req.session.user = { username: username }; res.status(200).json({ message: '登录成功' }); } else { res.status(401).json({ error: '用户名或密码错误' }); } });
app.get('/logout', (req, res) => { req.session.destroy(err => { if (err) return res.redirect('/'); res.clearCookie('connect.sid'); res.redirect('/login.html'); }); });
app.get('/', checkAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/get-sub-token', checkAuth, (req, res) => res.json({ token: SUB_TOKEN }));
app.get('/get-apiurl', checkAuth, (req, res) => res.json({ ApiUrl: API_URL }));
app.post('/admin/update-credentials', checkAuth, async (req, res) => { try { const { username, password, currentPassword } = req.body; if (!username || !password || !currentPassword) return res.status(400).json({ error: '所有字段都必须填写' }); const currentCredentialsFromFile = await loadCredentials(); if (currentPassword !== currentCredentialsFromFile.password) return res.status(400).json({ error: '当前密码错误' }); const newCredentials = { username, password }; if (await saveCredentials(newCredentials)) { credentials = newCredentials; console.log('In-memory credentials updated.'); res.json({ message: '密码修改成功' }); } else { res.status(500).json({ error: '保存密码失败' }); } } catch (error) { res.status(500).json({ error: '修改失败: ' + error.message }); } });

app.post('/admin/add-subscription', checkAuth, async (req, res) => { try { const newSubscriptionInput = req.body.subscription?.trim(); if (!newSubscriptionInput) return res.status(400).json({ error: 'Subscription data is required' }); if (!Array.isArray(subscriptions)) subscriptions = []; const lines = newSubscriptionInput.split('\n').map(line => line.trim()).filter(line => line); const addedSubs = [], existingSubs = []; for (const line of lines) { let alias = '', url = ''; const parts = line.split('|'); if (parts.length > 1) { alias = parts[0].trim(); url = parts.slice(1).join('|').trim(); } else { url = line.trim(); alias = ''; } if (!url.startsWith('http://') && !url.startsWith('https://')) continue; if (subscriptions.some(existingSub => existingSub.url.trim() === url)) { existingSubs.push(url); } else { addedSubs.push(url); subscriptions.push({ alias, url }); } } if (addedSubs.length > 0) { await saveData(subscriptions, nodes); const message = addedSubs.length === lines.length ? '订阅添加成功' : `成功添加 ${addedSubs.length} 个订阅，${existingSubs.length} 个订阅已存在`; res.status(200).json({ message }); } else { res.status(400).json({ error: '所有订阅已存在或输入格式不正确' }); } } catch (error) { res.status(500).json({ error: 'Failed to add subscription' }); } });

// --- 核心修改：添加节点路由支持备注 ---
app.post('/admin/add-node', checkAuth, async (req, res) => { 
    try { 
        const newNodeInput = req.body.node?.trim(); 
        if (!newNodeInput) return res.status(400).json({ error: 'Node is required' }); 
        
        if (!Array.isArray(nodes)) nodes = []; 
        
        const lines = newNodeInput.split('\n').map(line => line.trim()).filter(line => line); 
        const addedNodes = [], existingNodes = []; 
        
        for (const line of lines) { 
            let alias = ''; 
            let url = ''; 
            
            // 解析 "备注 | 链接"
            const parts = line.split('|'); 
            if (parts.length > 1) { 
                alias = parts[0].trim(); 
                url = parts.slice(1).join('|').trim(); 
            } else { 
                url = line.trim(); 
            } 
            
            url = tryDecodeBase64(url); 
            
            // 查重：只对比URL
            if (nodes.some(existingNode => existingNode.url === url)) { 
                existingNodes.push(url); 
            } else { 
                // 保存别名和链接，不修改链接内容
                nodes.push({ alias, url }); 
                addedNodes.push(url); 
            } 
        } 
        
        if (addedNodes.length > 0) { 
            await saveData(subscriptions, nodes); 
            const message = addedNodes.length === lines.length ? '节点添加成功' : `成功添加 ${addedNodes.length} 个节点，${existingNodes.length} 个节点已存在`; 
            res.status(200).json({ message }); 
        } else { 
            res.status(400).json({ error: '所有节点已存在' }); 
        } 
    } catch (error) { 
        res.status(500).json({ error: 'Failed to add node' }); 
    } 
});

// --- 核心修改：删除节点路由 ---
app.post('/admin/delete-subscription', checkAuth, async (req, res) => { try { const subsToDelete = req.body.subscription?.trim(); if (!subsToDelete) return res.status(400).json({ error: 'Subscription URL is required' }); if (!Array.isArray(subscriptions)) { subscriptions = []; return res.status(404).json({ error: 'No subscriptions found' }); } const deleteList = subsToDelete.split('\n').map(sub => sub.trim()).filter(sub => sub); const deletedSubs = [], notFoundSubs = []; deleteList.forEach(subToDelete => { const index = subscriptions.findIndex(sub => sub.url.trim() === subToDelete.trim()); if (index !== -1) { deletedSubs.push(subToDelete); subscriptions.splice(index, 1); } else { notFoundSubs.push(subToDelete); } }); if (deletedSubs.length > 0) { await saveData(subscriptions, nodes); const message = deletedSubs.length === deleteList.length ? '订阅删除成功' : `成功删除 ${deletedSubs.length} 个订阅，${notFoundSubs.length} 个订阅不存在`; res.status(200).json({ message }); } else { res.status(404).json({ error: '未找到要删除的订阅' }); } } catch (error) { res.status(500).json({ error: 'Failed to delete subscription' }); } });

app.post('/admin/delete-node', checkAuth, async (req, res) => { 
    try { 
        const nodesToDelete = req.body.node?.trim(); 
        if (!nodesToDelete) return res.status(400).json({ error: 'Node is required' }); 
        
        const deleteList = nodesToDelete.split('\n').map(node => cleanNodeString(node)).filter(node => node); 
        
        // 记录初始长度
        const initialLength = nodes.length;
        
        // 过滤掉匹配URL的节点
        nodes = nodes.filter(n => {
            const cleanUrl = cleanNodeString(n.url);
            return !deleteList.some(del => cleanNodeString(del) === cleanUrl);
        });

        const deletedCount = initialLength - nodes.length;

        if (deletedCount > 0) { 
            await saveData(subscriptions, nodes); 
            res.status(200).json({ message: `成功删除 ${deletedCount} 个节点` }); 
        } else { 
            res.status(404).json({ error: '未找到要删除的节点' }); 
        } 
    } catch (error) { 
        res.status(500).json({ error: 'Failed to delete node' }); 
    } 
});

// --- 核心修改：返回完整对象供前端渲染 ---
app.get('/admin/data', checkAuth, async (req, res) => { 
    try { 
        // 直接返回对象数组
        res.status(200).json({ subscriptions: Array.isArray(subscriptions) ? subscriptions : [], nodes: nodes }); 
    } catch (error) { 
        res.status(500).json({ error: 'Failed to fetch data' }); 
    } 
});

app.use(express.static(path.join(__dirname, 'public')));

// --- 核心修改：生成订阅时只输出 URL ---
app.get(`/${SUB_TOKEN}`, async (req, res) => { 
    try { 
        const { CFIP: queryCFIP, CFPORT: queryCFPORT } = req.query; 
        if (queryCFIP && queryCFPORT) console.log(`Using custom IP and PORT for this request: ${queryCFIP}:${queryCFPORT}`); 
        
        await loadData(); 
        const mergedSubscription = await generateMergedSubscription(queryCFIP, queryCFPORT); 
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8'); 
        res.send(Buffer.from(mergedSubscription).toString('base64')); 
    } catch (error) { 
        console.error(`Error handling /${SUB_TOKEN} route: ${error}`); 
        res.status(500).send('Internal Server Error'); 
    } 
});

function cleanNodeString(str) { return str.replace(/^["'`]+|["'`]+$/g, '').replace(/,+$/g, '').replace(/\s+/g, '').trim(); }
function tryDecodeBase64(str) { const base64Regex = /^[A-Za-z0-9+/=]+$/; try { if (base64Regex.test(str)) { const decoded = Buffer.from(str, 'base64').toString('utf-8'); if (['vmess://', 'vless://', 'trojan://', 'ss://', 'ssr://'].some(prefix => decoded.startsWith(prefix))) return decoded; } return str; } catch { return str; } }
async function fetchSubscriptionContent(url) { try { const response = await axios.get(url, { timeout: 10000 }); return response.data; } catch { return null; } }
function decodeBase64Content(content) { return Buffer.from(content, 'base64').toString('utf-8'); }

function addAliasToNodes(nodesContent, alias) { if (!alias) return nodesContent; const lines = nodesContent.split('\n').filter(line => line.trim() !== ''); const aliasedLines = lines.map(line => { try { if (line.startsWith('vmess://')) { const encoded = line.substring(8); const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8')); decoded.ps = `${alias} - ${decoded.ps}`; return 'vmess://' + Buffer.from(JSON.stringify(decoded)).toString('base64'); } else if (line.startsWith('vless://') || line.startsWith('trojan://') || line.startsWith('ss://')) { const parts = line.split('#'); const nodeName = parts.length > 1 ? decodeURIComponent(parts[1]) : ''; const aliasedName = `${alias} - ${nodeName}`; return `${parts[0]}#${encodeURIComponent(aliasedName)}`; } } catch (e) { console.error(`Failed to add alias to node: ${line}`, e); } return line; }); return aliasedLines.join('\n'); }
function replaceAddressAndPort(content, cfip, cfport) { if (!cfip || !cfport) return content; return content.split('\n').map(line => { line = line.trim(); if (line.startsWith('vmess://')) { try { const decoded = JSON.parse(Buffer.from(line.substring(8), 'base64').toString()); if ((decoded.net === 'ws' || decoded.net === 'xhttp') && decoded.tls === 'tls') { if (!decoded.host || decoded.host !== decoded.add) { decoded.add = cfip; decoded.port = parseInt(cfport, 10); } } return 'vmess://' + Buffer.from(JSON.stringify(decoded)).toString('base64'); } catch (e) { return line; } } if (line.startsWith('vless://') || line.startsWith('trojan://')) { if ((line.includes('type=ws') || line.includes('type=xhttp')) && line.includes('security=tls')) { try { const url = new URL(line); if (!url.searchParams.get('host') || url.searchParams.get('host') !== url.hostname) { return line.replace(/@([\w.-]+):(\d+)/, `@${cfip}:${cfport}`); } } catch (e) { return line; } } } return line; }).join('\n'); }

async function generateMergedSubscription(cfip, cfport) { 
    try { 
        const promises = subscriptions.map(async (subscription) => { 
            const content = await fetchSubscriptionContent(subscription.url); 
            if (content) { 
                const decoded = decodeBase64Content(content); 
                const aliased = addAliasToNodes(decoded, subscription.alias); 
                return replaceAddressAndPort(aliased, cfip, cfport); 
            } 
            return null; 
        }); 
        const resolvedContents = await Promise.all(promises); 
        const mergedContent = resolvedContents.filter(c => c !== null).join('\n'); 
        
        // 核心修改：提取 nodes 数组中的 url 属性进行拼接
        const nodesUrlString = nodes.map(n => n.url).join('\n');
        const updatedNodes = replaceAddressAndPort(nodesUrlString, cfip, cfport); 
        
        return `${mergedContent}\n${updatedNodes}`; 
    } catch (error) { 
        console.error(`Error generating merged subscription: ${error}`); 
        throw error; 
    } 
}

async function startServer() { try { await ensureDataDir(); await initializeCredentialsFile(); credentials = await loadCredentials(); console.log('Credentials loaded into memory at startup.'); await initializeDataFile(); app.listen(PORT, () => { console.log(`Node.js server is running and listening on port ${PORT}`); }); } catch (error) { console.error('Error starting server:', error); process.exit(1); } }
startServer();
