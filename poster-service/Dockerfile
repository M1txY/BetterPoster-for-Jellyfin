FROM node:22-bookworm-slim

# Fonts are required by librsvg (used by sharp) to render the badge text.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-liberation fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Install the bundled heavy display font (Archivo Black) for the resolution labels.
RUN cp fonts/*.ttf /usr/share/fonts/truetype/ && fc-cache -f

ENV PORT=8080
EXPOSE 8080
VOLUME ["/app/cache"]

CMD ["node", "server.js"]
