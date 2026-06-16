import SwiftUI
import UIKit
import WebKit

struct StaffWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(
        context: Context
    ) -> WKWebView {
        let configuration =
            WKWebViewConfiguration()

        configuration.websiteDataStore =
            .default()

        let webView = WKWebView(
            frame: .zero,
            configuration: configuration
        )

        webView.navigationDelegate =
            context.coordinator

        webView.allowsBackForwardNavigationGestures =
            true

        webView.scrollView.keyboardDismissMode =
            .interactive

        webView.load(
            URLRequest(
                url: url,
                cachePolicy:
                    .reloadIgnoringLocalCacheData
            )
        )

        return webView
    }

    func updateUIView(
        _ webView: WKWebView,
        context: Context
    ) {}

    final class Coordinator:
        NSObject,
        WKNavigationDelegate
    {
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction:
                WKNavigationAction,
            decisionHandler:
                @escaping (
                    WKNavigationActionPolicy
                ) -> Void
        ) {
            guard let url =
                    navigationAction.request.url
            else {
                decisionHandler(.cancel)
                return
            }

            let scheme =
                url.scheme?.lowercased() ?? ""

            if scheme == "http" ||
                scheme == "https"
            {
                decisionHandler(.allow)
                return
            }

            /*
             Square POS uses:
             square-commerce-v1://

             Opening it through UIApplication sends the
             transaction to the Square Point of Sale app
             installed on this same iPad.
             */
            UIApplication.shared.open(
                url,
                options: [:],
                completionHandler: nil
            )

            decisionHandler(.cancel)
        }
    }
}
