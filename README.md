# FaceLooker 👁️

A modern ES6 modular implementation of interactive face tracking that follows cursor movement or autonomous animation patterns.

## Features

- **Interactive Face Tracking**: Faces follow cursor movement in real-time
- **Autonomous Animation**: Red dot or bee animation with multiple movement patterns (circular, figure-8, sine wave, random)
- **Modular ES6 Architecture**: Clean, maintainable code structure with event-driven communication
- **Multiple Face Sets**: Support for different face sets with easy switching
- **Responsive Design**: Touch-friendly interface with modern UI controls
- **Performance Optimized**: Image caching, lazy loading, and efficient rendering
- **Customizable Settings**: Adjustable viewer sizes, debug modes, labels, and animation parameters

## Quick Start

1. Open `index.html` in a modern browser (Chrome, Firefox, Safari, Edge)
2. Click **Add Viewer** to create interactive face tracking instances
3. Move your mouse over the faces to see them track your cursor
4. Use the **Animation Driver** tab to enable autonomous movement patterns

### Adding Your Own Face Sets

1. Create a folder in the `faces/` directory (e.g., `faces/myface/`)
2. Add face images using the naming pattern: `gaze_px{X}_py{Y}_{SIZE}.webp`
3. Include a `meta.json` file with face information:
   ```json
   {
     "name": "Person Name",
     "subtitle": "Description or #ID",
     "author": "Photographer/Creator",
     "source": "https://example.com",
     "license": "CC BY-SA 4.0"
   }
   ```
4. Add your folder to `registry.json` to make it available in the app

## Project Structure

```
face_looker/
├── index.html           # Main application
├── config.js           # Application configuration
├── FaceLooker.js       # Main face tracking class
├── animation/
│   └── AnimationDriver.js # Autonomous animation system
├── data/
│   ├── FaceSetLoader.js   # Face set management
│   └── ImageCache.js      # Image caching system
├── events/
│   └── EventBus.js        # Event communication system
├── assets/
│   └── bee.svg            # Bee animation graphic
├── faces/              # Face sets directory
├── registry.json       # Available face sets
└── README.md
```

## Configuration

The application uses a modular configuration system:

- **Viewer Settings**: Size, appearance, debug modes
- **Grid Configuration**: Tracking grid parameters (min/max positions, step size)
- **Performance Settings**: Cache size, optimization options
- **Animation Settings**: Movement patterns, speed, visual types

## Animation Patterns

The Animation Driver supports multiple autonomous movement patterns:

- **Circular**: Smooth circular motion
- **Figure-8**: Figure-8 pattern movement
- **Sine**: Sinusoidal wave movement
- **Random**: Random walk with smooth interpolation

## Browser Support

- Modern browsers with ES6 module support
- Touch devices (mobile, tablet)
- Responsive design adapts to different screen sizes

## Credits

**Project Website**: [https://facelooker.toolbomber.com](https://facelooker.toolbomber.com)

**Original Concept**: Based on [Kylan O'Connor's face_looker](https://github.com/kylapo/face_looker)

**ES6 Module Implementation**: Built by [Jikku Jose](https://x.com/jikkujose)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

This project welcomes contributions! Please ensure your code follows the existing modular architecture and includes proper documentation.
