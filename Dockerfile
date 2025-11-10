# ===============================================================
# Dockerfile for the Node.js Application
# ===============================================================
FROM node:lts-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Node.js 应用将在 3000 端口上监听
EXPOSE 3000

# 容器启动时直接运行 Node.js 应用
CMD ["node", "app.js"]
