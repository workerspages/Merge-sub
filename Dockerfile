# --- 阶段 1: 构建 Node.js 应用 ---
FROM node:lts-alpine AS builder

WORKDIR /app

# 复制 package.json 并安装依赖
COPY package*.json ./
RUN npm install --production

# 复制所有应用源代码
COPY . .


# --- 阶段 2: 创建最终的生产镜像 ---
FROM nginx:1.25-alpine

# 安装 Node.js 和 Supervisor
RUN apk update && apk add --no-cache nodejs npm supervisor

# 从 'builder' 阶段复制构建好的 Node.js 应用和其依赖
# 注意：我们复制到了 /app 目录
COPY --from=builder /app /app

# 复制我们自定义的 Nginx 配置文件
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# 复制 Supervisor 配置文件
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# 暴露 Nginx 的 80 端口 (这是容器对外服务的端口)
EXPOSE 80

# 定义容器启动时执行的命令
# 使用 supervisord 来同时启动和管理 nginx 和 nodejs 进程
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
