FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer caching)
# Source is mounted as a volume at runtime for hot-reloading
COPY package.json ./
RUN npm install

EXPOSE 5173

CMD ["npm", "run", "dev"]
