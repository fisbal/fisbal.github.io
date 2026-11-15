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

    // JavaMail's two jars both carry these licence files: keep one copy each, the build refuses duplicates.
    packaging {
        resources {
            pickFirsts += setOf("META-INF/LICENSE.md", "META-INF/NOTICE.md", "META-INF/LICENSE.txt", "META-INF/NOTICE.txt")
        }
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
    // In 1 Mail's IMAP/SMTP engine (MailEngine.java): JavaMail for Android (Oracle/Eclipse, EPL/GPL+CPE).
    // Only used by apps whose mb-config.json has mail:true; the classes just sit unused in the others.
    implementation("com.sun.mail:android-mail:1.6.7")
    implementation("com.sun.mail:android-activation:1.6.7")
}
