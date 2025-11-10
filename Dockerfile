# --- 阶段 1: 构建 Node.js 应用 ---
FROM node:lts-alpine AS builder

WORKDIR /app

# 复制 package.json 并安装生产依赖
COPY package*.json ./
RUN npm install --production

# 复制所有应用源代码
COPY . .


# --- 阶段 2: 创建最终的生产镜像 ---
FROM nginx:1.25-alpine

# [修改] 安装 Node.js 和 npm，但不再安装 supervisor
RUN apk update && apk add --no-cache nodejs npm

# 从 'builder' 阶段复制构建好的 Node.js 应用及其依赖到 /app 目录
COPY --from=builder /app /app

# 复制我们自定义的 Nginx 配置文件到正确的位置
# (请确保您的项目根目录下有 nginx/default.conf 这个文件)
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# 暴露 Nginx 监听的 80 端口
EXPOSE 80

# [修改] 定义容器启动时执行的命令
# 直接运行我们的 Node.js 应用，它会在内部负责启动 Nginx
CMD ["node", "/app/app.js"]
