# Twin Watch

Twin Watch is a real-time video synchronization and chat application using PeerJS and HTML5 video elements. It allows users to watch videos together remotely while chatting.

## Features

- **Real-time Video Synchronization:** Watch videos together with synchronized playback controls.
- **Peer-to-Peer Communication:** Uses PeerJS for peer-to-peer data connections.
- **Chat:** Integrated chat feature for communication during video playback.
- **Command-based Room Creation and Joining:** Use commands ("/create" and "/join room_id") in the chat to create or join rooms.

## Setup Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/tharunbirla/twin-watch.git
   ```

2. Open `index.html` in your web browser.

3. Start watching videos and chatting with others!

## Usage

- **Creating a Room:** Type `/create` in the chat input to create a room. Share the generated Room ID with others to join the room.
  
- **Joining a Room:** Type `/join room_id` in the chat input to join a room using the provided Room ID.

- **Video Playback:** Upload a video file using the "Upload Video" button. The host can select a video file, and all participants will synchronize their playback with the host.

- **Status** Type `/status` in the chat input to get the connection status.

- **Info** Type `/info` in the chat input to get the room code.

## Technologies Used

- JavaScript
- PeerJS

## Credits

- **PeerJS:** Used for establishing peer-to-peer connections.
- **Icons:** SVG icons used in the UI.

## Release Notes

See the [changelog](CHANGELOG.md) for information about the latest updates.

## Contributing

If you encounter any issues or have suggestions for improvements, feel free to open an issue or submit a pull request.

Sync and Chat: Enjoy Videos Together!