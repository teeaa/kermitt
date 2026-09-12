<p align="center">
  <img width="150px" alt="Kermitt" src="https://github.com/user-attachments/assets/db815a85-673c-445c-bf0b-19df898d6ba7" />
  <h1 align="center">Kermitt</h1>
</p>

## Yet another k8s GUI tool

### Screenshot

<p align="center">
  <img width="720px" alt="Screenshot of Kermitt" src="https://github.com/user-attachments/assets/5bfc8ced-4f22-4673-8843-ce0a6b2c35ca" />
</p>


### What makes this special?

- Stream logs from multiple pods
<video src="https://github.com/user-attachments/assets/d3ac1c22-9599-45c4-9a3c-ff3a5b4c7430" autoplay loop muted playsinline width="100%"></video>

- Filter logs by excluding and including log lines
<video src="https://github.com/user-attachments/assets/36335082-35a4-43cb-be6e-f279607f67ea" autoplay loop muted playsinline width="100%"></video>

### Other features include
- Pin a pod to favourites - jumps to the context and namespace the pod is in
- Change the font and size in logs
- Customise the status bar columns

## Fixing security issue on MacOS

Since the application package is not signed and signing it costs a bundle you will see this error when running the app on MacOS

<img width="257" height="245" alt="Screenshot 2026-09-12 at 12 49 01" src="https://github.com/user-attachments/assets/81a2b975-18b2-414f-9175-509b9729f004" />

To fix it:
1. Click `Done`
2. Go to Settings / Privacy & Security
3. Scroll down until you see `kermitt.app` and choose "Run anyway"

## Running the `dev` version

If you have an error or want to see the console logs the best way to accomplish this is by running the development version of Kermitt.

### Prerequisites

- Go 1.27 or newer  
Download from https://go.dev/doc/install
- Wails 2.15.0 or newer  
Download from https://wails.io/

### Running the dev version

This is as simple as running `wails dev` in the repository root.
