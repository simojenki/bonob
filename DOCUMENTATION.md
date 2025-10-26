# Bonob Source Code Documentation

This document provides an overview of the source files in the `src` directory, explaining the purpose and functionality of each.

### `api_tokens.ts`

Manages API tokens for authentication. It includes an in-memory implementation for storing and retrieving tokens, using SHA256 to mint new tokens.

### `app.ts`

This is the main entry point of the application. It initializes the server, configures the music service (Subsonic), and sets up the integration with Sonos. It reads the application config, sets up the Subsonic connection, and starts the Express server.

### `b64.ts`

Provides simple utility functions for Base64 encoding and decoding of strings.

### `burn.ts`

Handles the creation and parsing of "Bonob URNs" (BURNs), which are unique resource identifiers used within the system. It supports encryption and shorthand notations for more compact URNs.

### `clock.ts`

Provides an abstraction for time-related functions, which is useful for testing. It includes a `SystemClock` that uses the actual system time and a `FixedClock` for tests. It also contains logic for detecting special dates like Christmas and Halloween for seasonal features.

### `config.ts`

Manages the application's configuration by reading environment variables. It defines settings for the server, Sonos integration, Subsonic connection, and other features like scrobbling.

### `encryption.ts`

Implements encryption and decryption functionality using JSON Web Signatures (JWS). It provides a simple interface for encrypting and decrypting strings.

### `i8n.ts`

Handles internationalization (i18n) by providing translations for different languages supported by the Sonos app. It includes translations for UI elements and messages.

### `icon.ts`

Manages SVG icons used in the Sonos app. It allows for transformations like changing colors and applying special styles for festivals and holidays.

### `link_codes.ts`

Implements a system for linking Sonos devices with user accounts. It generates temporary codes that users can use to log in and associate their accounts.

### `logger.ts`

Configures the application-wide logger using Winston. It sets up logging levels and formats.

### `music_service.ts`

Defines the interfaces for a generic music service. This includes methods for authentication, browsing content (artists, albums, tracks), streaming audio, and managing playlists.

### `register.ts`

A command-line script used to register the Bonob service with Sonos devices on the local network.

### `registrar.ts`

Contains the core logic for registering the Bonob service with Sonos devices. It fetches service details from the Bonob server and sends the registration request to a Sonos device.

### `server.ts`

Sets up the Express web server. It defines the routes for the web interface, the Sonos Music API (SMAPI) endpoints, and audio streaming. It also handles user authentication and session management.

### `smapi_auth.ts`

Handles authentication for the Sonos Music API (SMAPI). It is responsible for issuing and verifying JWTs (JSON Web Tokens) that secure the communication between Sonos devices and the Bonob server.

### `smapi_token_store.ts`

Provides an interface and two implementations (in-memory and file-based) for storing SMAPI authentication tokens. This allows the server to persist user sessions.

### `smapi.ts`

Implements the Sonos Music API (SMAPI) using SOAP. This file is responsible for handling all the requests from Sonos devices, such as browsing music, searching, and getting track metadata.

### `sonos.ts`

Manages interactions with Sonos devices on the local network. This includes device discovery and service registration.

### `subsonic.ts`

Implements the `MusicService` interface for Subsonic-compatible media servers (like Navidrome). It handles all communication with the Subsonic API to fetch music data and stream audio.

### `url_builder.ts`

A utility class for building and manipulating URLs in a structured way.

### `utils.ts`

Contains miscellaneous utility functions used throughout the application, such as a function for tidying up XML strings.
