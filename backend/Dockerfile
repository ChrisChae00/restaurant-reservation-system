# Runs directly with tsx rather than a tsc build step: the backend imports shared code from
# ../src/lib via a tsconfig path alias (@/*), which plain `tsc` compiles to but Node's ESM
# loader can't resolve at runtime without an extra rewrite tool. tsx resolves tsconfig paths
# itself, so it's the simplest thing that works for a service this size — see the ponytail
# note in src/index.ts.
FROM node:20-slim
WORKDIR /repo
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev
COPY src ./src
COPY backend ./backend
WORKDIR /repo/backend
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "start"]
