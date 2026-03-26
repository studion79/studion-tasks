FROM node:20-alpine
WORKDIR /app

# Dépendances
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Génération du client Prisma
RUN npx prisma generate

# Code source + build
COPY . .
RUN npm run build

EXPOSE 3000

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
