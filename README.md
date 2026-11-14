# Abandoned but not Forgotten

## Arranque (dos terminales)
```bash
# Terminal 1 - backend (solo local; Vite lo expone vía /api)
cd backend && pip install -r requirements.txt
python scripts/download_kernels.py
uvicorn main:app --reload

# Terminal 2 - frontend (HTTPS + red local)
cd frontend && npm install && npm run dev
```

## Acceso desde otros dispositivos (misma red Wi-Fi)
1. IP del PC:  `ip -4 addr | grep inet`
2. Firewall (Arch): `sudo ufw allow 5173/tcp`  (o `sudo firewall-cmd --add-port=5173/tcp`)
3. Laptop/móvil/Quest: abrir `https://IP_DEL_PC:5173` y aceptar el aviso del certificado
   (Avanzado -> Continuar). El certificado es autofirmado.
4. Quest 2: en el Navegador de Meta, abrir la misma URL y pulsar **ENTER VR**.

## Si el Quest no entra en VR
- WebXR solo funciona en HTTPS (o localhost). Con `http://IP` el botón dirá que falta WebXR.
- Alternativa sin aviso de certificado: `adb reverse tcp:5173 tcp:5173` y abrir
  `https://localhost:5173` en el Quest (requiere modo desarrollador y adb).
- Si no conecta: la red puede tener "aislamiento de clientes"; prueba otra red o un hotspot del móvil.
