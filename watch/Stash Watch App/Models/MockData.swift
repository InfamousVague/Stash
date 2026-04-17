import Foundation

enum MockData {
    static let projects: [Project] = [
        Project(
            id: "proj-1",
            sourceDeviceId: "work-mac",
            name: "my-api",
            path: "/Users/dev/projects/my-api",
            framework: "Express",
            activeProfile: ".env.production",
            profiles: [".env", ".env.local", ".env.production", ".env.staging"],
            variableCounts: [".env": 12, ".env.local": 15, ".env.production": 23, ".env.staging": 20],
            health: ProjectHealth(staleCount: 0, expiringCount: 0, exposedCount: 0)
        ),
        Project(
            id: "proj-2",
            sourceDeviceId: "work-mac",
            name: "web-app",
            path: "/Users/dev/projects/web-app",
            framework: "Next.js",
            activeProfile: ".env.local",
            profiles: [".env", ".env.local", ".env.production"],
            variableCounts: [".env": 10, ".env.local": 18, ".env.production": 18],
            health: ProjectHealth(staleCount: 2, expiringCount: 1, exposedCount: 0)
        ),
        Project(
            id: "proj-3",
            sourceDeviceId: "personal-mac",
            name: "mobile-backend",
            path: "/Users/dev/projects/mobile-backend",
            framework: "Django",
            activeProfile: ".env.staging",
            profiles: [".env", ".env.local", ".env.production", ".env.staging", ".env.test"],
            variableCounts: [".env": 20, ".env.local": 25, ".env.production": 31, ".env.staging": 31, ".env.test": 15],
            health: ProjectHealth(staleCount: 0, expiringCount: 0, exposedCount: 1)
        ),
    ]

    static let profiles: [Profile] = [
        Profile(name: ".env", variableCount: 12),
        Profile(name: ".env.local", variableCount: 15),
        Profile(name: ".env.production", variableCount: 23),
        Profile(name: ".env.staging", variableCount: 20),
    ]

    static let variables: [EnvVariable] = [
        EnvVariable(key: "DATABASE_URL", encryptedFor: ["mock-device": "mock-ciphertext"]),
        EnvVariable(key: "API_KEY", encryptedFor: ["mock-device": "mock-ciphertext"]),
        EnvVariable(key: "SECRET_TOKEN", encryptedFor: ["__locked__": "vault_locked"]),
        EnvVariable(key: "REDIS_URL", encryptedFor: ["mock-device": "mock-ciphertext"]),
        EnvVariable(key: "AWS_ACCESS_KEY", encryptedFor: ["__locked__": "vault_locked"]),
        EnvVariable(key: "STRIPE_KEY", encryptedFor: ["mock-device": "mock-ciphertext"]),
    ]
}
