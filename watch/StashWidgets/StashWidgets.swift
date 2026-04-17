import WidgetKit
import SwiftUI

@main
struct StashWidgetBundle: WidgetBundle {
    var body: some Widget {
        ActiveProfileWidget()
        HealthWidget()
    }
}
