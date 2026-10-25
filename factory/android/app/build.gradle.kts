plugins {
    id("com.android.application")
}

// Every value comes from -P properties passed by the factory workflow, so one template builds every app.
fun prop(key: String, fallback: String): String = (project.findProperty(key) as String?) ?: fallback

android {
    namespace = "com.martinb.shell"
    compileSdk = 34

    defaultConfig {
        applicationId = prop("mbAppId", "com.martinb.app")
        minSdk = 24
        targetSdk = 34
        versionCode = prop("mbVersionCode", "1").toInt()
        versionName = prop("mbVersionName", "1.0")
        manifestPlaceholders["mbOrientation"] = prop("mbOrientation", "unspecified")
    }

    // Family key kept with the template so every new APK installs over the previous one and keeps the app's data.
    signingConfigs {
        create("family") {
            storeFile = file(prop("mbStoreFile", "../keys/martinb.jks"))
            storePassword = prop("mbStorePass", "martinb2026")
            keyAlias = prop("mbKeyAlias", "martinb")
            keyPassword = prop("mbStorePass", "martinb2026")
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("family")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
