# Use official Node.js Alpine image
FROM node:22-alpine

# Set working directory
WORKDIR /usr/src/app

# Set environment to production
ENV NODE_ENV=production
ENV PORT=5000

# Install dependencies first (leverages Docker layer cache)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source code
COPY . .

# Use non-root user for security
USER node

# Expose server port
EXPOSE 5000

# Start application
CMD ["node", "index.js"]

