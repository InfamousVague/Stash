// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "StashBar",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "StashBar",
            path: "Sources/StashBar"
        )
    ]
)
