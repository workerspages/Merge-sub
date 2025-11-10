# ===============================================================
# The Final, Corrected Dockerfile
# ===============================================================

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

# [核心修正] 在构建时直接修改 Nginx 的主配置文件
# 使用 sed 命令将默认的日志文件路径替换为标准输出/错误流
# 这会在 Nginx 启动的最开始就生效，从根本上解决问题
RUN sed -i -e 's|/var/log/nginx/access.log|/dev/stdout|g' \
           -e 's|/var/log/nginx/error.log|/dev/stderr|g' \
           /etc/nginx/nginx.conf

# 从 'builder' 阶段复制构建好的 Node.js 应用
COPY --from=builder /app /app

# 复制我们的站点配置文件
# (这个文件现在可以保持简洁)
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# 暴露 Nginx 的 80 端口
EXPOSE 80

# 定义容器启动时执行的命令
CMD ["node", "/app/app.js"]
