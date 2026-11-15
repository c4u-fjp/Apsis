# Backend Apsis para Render (o cualquier servicio con Docker).
# Los kernels SPICE (~45 MB) no están en git: se descargan de NAIF al construir la imagen.
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN python scripts/download_kernels.py && ls -R nasa_data/kernels
# Render indica el puerto en $PORT (8000 si no se define)
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
