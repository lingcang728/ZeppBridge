//! 托盘菜单文案的十语言表。
//!
//! 原生菜单走不了前端的 i18n，只能在这里备一份。前端定好界面语言后经
//! `set_tray_locale` 命令把语言码喂进来；建托盘时（前端还没加载）用系统
//! 界面语言先猜一次。
//!
//! 匹配规则和前端 `detectLocale` 一致：完整标记精确匹配（`pt-BR`、
//! `pt-PT`、`hi-IN`），否则按基础语言分（`de-AT`→de、`zh-TW`→zh），
//! 裸 `pt` 给欧洲葡萄牙语，认不出的一律英文。

/// 托盘菜单的三条文案。
pub struct TrayLabels {
    pub show: &'static str,
    pub sync: &'static str,
    pub quit: &'static str,
}

const ZH: TrayLabels = TrayLabels {
    show: "打开窗口",
    sync: "立即同步",
    quit: "退出",
};

const EN: TrayLabels = TrayLabels {
    show: "Open ZeppBridge",
    sync: "Sync now",
    quit: "Quit",
};

const ES: TrayLabels = TrayLabels {
    show: "Abrir ZeppBridge",
    sync: "Sincronizar ahora",
    quit: "Salir",
};

const NL: TrayLabels = TrayLabels {
    show: "ZeppBridge openen",
    sync: "Nu synchroniseren",
    quit: "Afsluiten",
};

// 巴西葡语习惯省略冠词（"Abrir ZeppBridge"），欧洲葡语保留（"Abrir o …"）。
const PT_BR: TrayLabels = TrayLabels {
    show: "Abrir ZeppBridge",
    sync: "Sincronizar agora",
    quit: "Sair",
};

const PT_PT: TrayLabels = TrayLabels {
    show: "Abrir o ZeppBridge",
    sync: "Sincronizar agora",
    quit: "Sair",
};

// 草稿（未经母语审校）：de / ru / hi 三条为直译初版，W4 复核。
const DE: TrayLabels = TrayLabels {
    show: "ZeppBridge öffnen",
    sync: "Jetzt synchronisieren",
    quit: "Beenden",
};

const RU: TrayLabels = TrayLabels {
    show: "Открыть ZeppBridge",
    sync: "Синхронизировать",
    quit: "Выход",
};

const HI: TrayLabels = TrayLabels {
    show: "ZeppBridge खोलें",
    sync: "अभी सिंक करें",
    quit: "बंद करें",
};

const FR: TrayLabels = TrayLabels {
    show: "Ouvrir ZeppBridge",
    sync: "Synchroniser",
    quit: "Quitter",
};

/// 按语言码取托盘文案。接受 `pt-BR` / `de-AT` / `zh` / `LANG=de_DE.UTF-8`
/// 这类输入：小写归一、`_`→`-`，先精确匹配再逐段砍地区子标签，最后按
/// 基础语言落桶；认不出一律英文。
pub fn tray_labels(locale: &str) -> TrayLabels {
    let mut tag = locale.trim().to_ascii_lowercase().replace('_', "-");
    // env 形参里可能带 `de_DE.UTF-8` 的后缀。
    if let Some(dot) = tag.find('.') {
        tag.truncate(dot);
    }
    while !tag.is_empty() {
        match tag.as_str() {
            "zh" => return ZH,
            "en" => return EN,
            "es" => return ES,
            "nl" => return NL,
            "pt-br" => return PT_BR,
            // 裸 pt 和未列出的葡语地区（pt-AO 等）一律给欧洲葡萄牙语。
            "pt" | "pt-pt" => return PT_PT,
            "de" => return DE,
            "ru" => return RU,
            "hi" | "hi-in" => return HI,
            "fr" => return FR,
            _ => {}
        }
        match tag.rfind('-') {
            Some(cut) => tag.truncate(cut),
            None => break,
        }
    }
    EN
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_regional_variants() {
        // pt-BR 与 pt-PT 的 show 文案刻意不同（冠词），用来证明路由分对。
        assert_eq!(tray_labels("pt-BR").show, "Abrir ZeppBridge");
        assert_eq!(tray_labels("pt-PT").show, "Abrir o ZeppBridge");
        assert_eq!(tray_labels("hi-IN").quit, "बंद करें");
        assert_eq!(tray_labels("zh").quit, "退出");
        assert_eq!(tray_labels("es").quit, "Salir");
    }

    #[test]
    fn base_language_fallback() {
        assert_eq!(tray_labels("de-AT").quit, "Beenden");
        assert_eq!(tray_labels("zh-TW").quit, "退出");
        // 裸 pt 和未列出的葡语地区一律 → 欧洲葡语（带冠词那份）。
        assert_eq!(tray_labels("pt").show, "Abrir o ZeppBridge");
        assert_eq!(tray_labels("pt-AO").show, "Abrir o ZeppBridge");
        assert_eq!(tray_labels("en-GB").quit, "Quit");
        assert_eq!(tray_labels("fr-CA").quit, "Quitter");
    }

    #[test]
    fn env_style_and_unknown_fall_to_english() {
        assert_eq!(tray_labels("de_DE.UTF-8").quit, "Beenden");
        assert_eq!(tray_labels("ja-JP").quit, "Quit");
        assert_eq!(tray_labels("").quit, "Quit");
    }
}
