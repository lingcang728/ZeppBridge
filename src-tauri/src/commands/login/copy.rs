//! 登录窗口里我们自己写的字：窗口标题和顶部横幅，按界面语言走。
//!
//! 这两句不经过前端的 i18n 层（登录窗口加载的是 Zepp 的网页，没有我们的界面），
//! 所以十二种语言就地写在这里。归一规则和 `tray_i18n::tray_labels` 一致：小写、
//! `_`→`-`、去 `.` 后缀，先精确匹配再逐段砍地区子标签，认不出一律英文。

/// 把界面语言归到这里有文案的那几种之一。裸 `pt` 与未列出的葡语地区一律欧洲葡语，
/// 同 tray_i18n 的裁决。
fn login_locale_key(locale: &str) -> &'static str {
    let mut tag = locale.trim().to_ascii_lowercase().replace('_', "-");
    if let Some(dot) = tag.find('.') {
        tag.truncate(dot);
    }
    while !tag.is_empty() {
        match tag.as_str() {
            "zh" => return "zh",
            "es" => return "es",
            "nl" => return "nl",
            "pt-br" => return "pt-br",
            "pt" | "pt-pt" => return "pt",
            "de" => return "de",
            "ru" => return "ru",
            "hi" | "hi-in" => return "hi",
            "fr" => return "fr",
            "it" => return "it",
            "pl" => return "pl",
            "en" => return "en",
            _ => {}
        }
        match tag.rfind('-') {
            Some(cut) => tag.truncate(cut),
            None => break,
        }
    }
    "en"
}

/// 登录弹窗标题。
pub(super) fn login_window_title(locale: &str) -> &'static str {
    match login_locale_key(locale) {
        "zh" => "登录 Zepp",
        "es" => "Iniciar sesión en Zepp",
        "nl" => "Inloggen bij Zepp",
        "pt-br" => "Entrar no Zepp",
        "pt" => "Iniciar sessão no Zepp",
        "de" => "Bei Zepp anmelden",
        "ru" => "Войти в Zepp",
        "hi" => "Zepp में साइन इन करें",
        "fr" => "Se connecter à Zepp",
        "it" => "Accedi a Zepp",
        "pl" => "Zaloguj się do Zepp",
        _ => "Sign in to Zepp",
    }
}

/// 登录窗口顶部的横幅：只支持 Zepp 邮箱 / 手机号 + 密码。
///
/// 第二句是这条限制真正要防的事：用 Google 注册的 Zepp 账号，换成同一个邮箱加
/// 密码登录，Zepp 会当成另一个账号。怎么在 Zepp App 里给第三方注册的账号补设
/// 密码，要等真机核对过入口才写进来，这里不猜路径。
pub(super) fn login_banner_text(locale: &str) -> &'static str {
    match login_locale_key(locale) {
        "zh" => "ZeppBridge 只支持 Zepp 邮箱 / 手机号 + 密码登录，Google、Apple、微信、小米、Facebook 等第三方登录在这里用不了。如果你的 Zepp 账号当初是用第三方注册的，用同一个邮箱加密码登录会被 Zepp 当成另一个账号。",
        "es" => "ZeppBridge solo admite iniciar sesión con el correo o el teléfono de Zepp y contraseña. Google, Apple, WeChat, Xiaomi y Facebook no funcionan aquí. Si creaste tu cuenta de Zepp con uno de ellos, entrar con el mismo correo y una contraseña cuenta como otra cuenta de Zepp.",
        "nl" => "ZeppBridge ondersteunt alleen inloggen met je Zepp-e-mailadres of -telefoonnummer en wachtwoord. Inloggen met Google, Apple, WeChat, Xiaomi of Facebook werkt hier niet. Heb je je Zepp-account met een daarvan aangemaakt, dan telt inloggen met hetzelfde e-mailadres en een wachtwoord als een ander Zepp-account.",
        "pt-br" => "O ZeppBridge só aceita entrar com e-mail ou telefone da Zepp e senha. Login com Google, Apple, WeChat, Xiaomi ou Facebook não funciona aqui. Se você criou sua conta Zepp com um deles, entrar com o mesmo e-mail e uma senha conta como outra conta Zepp.",
        "pt" => "O ZeppBridge só suporta iniciar sessão com o e-mail ou o telemóvel da Zepp e palavra-passe. Google, Apple, WeChat, Xiaomi e Facebook não funcionam aqui. Se criou a sua conta Zepp com um deles, entrar com o mesmo e-mail e uma palavra-passe conta como outra conta Zepp.",
        "de" => "ZeppBridge unterstützt nur die Anmeldung mit Zepp-E-Mail-Adresse oder -Telefonnummer und Passwort. Google, Apple, WeChat, Xiaomi und Facebook funktionieren hier nicht. Wenn du dein Zepp-Konto mit einem davon erstellt hast, gilt die Anmeldung mit derselben E-Mail-Adresse und einem Passwort als anderes Zepp-Konto.",
        "ru" => "ZeppBridge поддерживает только вход по e-mail или номеру телефона Zepp и паролю. Вход через Google, Apple, WeChat, Xiaomi или Facebook здесь не работает. Если аккаунт Zepp создан через один из них, вход с тем же e-mail и паролем Zepp считает другим аккаунтом.",
        "hi" => "ZeppBridge केवल Zepp ईमेल या फ़ोन नंबर और पासवर्ड से साइन इन का समर्थन करता है। Google, Apple, WeChat, Xiaomi या Facebook से साइन इन यहाँ काम नहीं करता। अगर आपने अपना Zepp खाता इनमें से किसी से बनाया था, तो उसी ईमेल और पासवर्ड से साइन इन करना Zepp के लिए एक अलग खाता है।",
        "fr" => "ZeppBridge accepte uniquement la connexion avec l’e-mail ou le numéro de téléphone Zepp et un mot de passe. Google, Apple, WeChat, Xiaomi et Facebook ne fonctionnent pas ici. Si vous avez créé votre compte Zepp avec l’un d’eux, se connecter avec le même e-mail et un mot de passe correspond à un autre compte Zepp.",
        "it" => "ZeppBridge supporta solo l’accesso con e-mail o numero di telefono Zepp e password. Google, Apple, WeChat, Xiaomi e Facebook qui non funzionano. Se hai creato l’account Zepp con uno di questi, accedere con la stessa e-mail e una password conta come un altro account Zepp.",
        "pl" => "ZeppBridge obsługuje tylko logowanie adresem e-mail lub numerem telefonu Zepp i hasłem. Google, Apple, WeChat, Xiaomi i Facebook tu nie działają. Jeśli konto Zepp zostało założone przez jedną z tych usług, logowanie tym samym adresem e-mail i hasłem to dla Zepp inne konto.",
        _ => "ZeppBridge only supports signing in with your Zepp email or phone number and password. Google, Apple, WeChat, Xiaomi and Facebook sign-in don’t work here. If you created your Zepp account with one of those, signing in with the same email and a password counts as a different Zepp account.",
    }
}
