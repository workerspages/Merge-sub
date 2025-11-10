# --- 阶段 1: 构建 Node.js 应用 ---
FROM node:lts-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .


# --- 阶段 2: 创建最终的生产镜像 ---
FROM nginx:1.25-alpine

# 安装 Node.js 和 npm
RUN apk update && apk add --no-cache nodejs npm

# 从 'builder' 阶段复制构建好的 Node.js 应用
COPY --from=builder /app /app

# 复制我们修改后的 Nginx 配置文件
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# [关键修改] 移除了之前添加的 RUN ln -sf ... 指令
# 因为我们已经在 nginx/default.conf 中处理了日志

# 暴露 Nginx 的 80 端口
EXPOSE 80

# 定义容器启动时执行的命令
CMD ["node", "/app/app.js"]
