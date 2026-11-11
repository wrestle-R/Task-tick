import qs
import qs.services
import qs.modules.common
import qs.modules.common.widgets
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io

FocusScope {
    id: root
    property bool active: GlobalStates.sidebarLeftOpen
    property string kind: "todo"
    property var state: ({items: [], outbox: []})
    property bool connected: false
    property string errorText: ""
    readonly property string executable: Quickshell.env("HOME") + "/.local/bin/tick-and-done"
    readonly property var items: (state.items || []).filter(i => i.kind === root.kind && !i.done && !i.deletedAt).sort((a,b) => a.position-b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    function focusActiveItem() { if (connected) input.forceActiveFocus(); else legacy.item?.focusActiveItem(); }
    function refresh() { if (!read.running) { read.command = [executable, "--ipc", JSON.stringify({action:"state"})]; read.running = true; } }
    function mutate(value) { if (write.running) return; value.expectedAccount = root.state._account; write.command = [executable, "--ipc", JSON.stringify(value)]; write.running = true; }
    onActiveChanged: { if (active) { kind = "todo"; refresh(); Qt.callLater(focusActiveItem); } }
    Component.onCompleted: refresh()
    Timer { interval: 1500; repeat: true; running: root.active; onTriggered: root.refresh() }
    Process {
        id: read
        stdout: StdioCollector { onStreamFinished: { try { const data = JSON.parse(text); root.connected = !data.error; if (root.connected) root.state = data; } catch(e) { root.connected = false; } } }
    }
    Process {
        id: write
        stdout: StdioCollector { onStreamFinished: { try { const data=JSON.parse(text); if(data.error) root.errorText=data.error; else {root.state=data;root.errorText="";} } catch(e) {root.errorText="Could not save. Try again.";} } }
        onExited: root.refresh()
    }
    Loader { id: legacy; anchors.fill: parent; active: !root.connected; sourceComponent: SidebarDashboard {} }
    ColumnLayout {
        anchors.fill: parent; anchors.margins: 14; spacing: 14; visible: root.connected
        HyprTrackSummary { Layout.fillWidth: true; Layout.maximumHeight: implicitHeight; active: root.active && root.visible }
        Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Appearance.colors.colLayer0Border }
        RowLayout {
            Layout.fillWidth: true; spacing: 8
            Repeater { model: [{kind:"todo",title:"Todos"},{kind:"movie",title:"Movies"}]
                delegate: Button { required property var modelData; text: modelData.title; checkable: true; checked: root.kind===modelData.kind; onClicked: root.kind=modelData.kind; Layout.fillWidth: true }
            }
        }
        RowLayout {
            Layout.fillWidth: true
            StyledText { text: root.kind==="todo"?"One thing at a time.":"For your next night in."; font.pixelSize: 12; color: Appearance.colors.colSubtext; Layout.fillWidth: true }
            StyledText { text: root.items.length; font.pixelSize: 12; color: Appearance.colors.colSubtext }
        }
        ListView {
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true; model: root.items; spacing: 2
            ScrollBar.vertical: ScrollBar {}
            delegate: Item {
                id: row
                required property var modelData
                width: ListView.view.width; height: Math.max(53, title.implicitHeight+20)
                RowLayout {
                    anchors.fill: parent; spacing: 10
                    CheckBox { Accessible.name: "Complete " + row.modelData.title; onClicked: root.mutate({action:"toggle",kind:root.kind,id:row.modelData.id}); enabled: !write.running }
                    StyledText { id: title; Layout.fillWidth: true; text: row.modelData.title; textFormat: Text.PlainText; wrapMode: Text.Wrap; font.pixelSize: 14 }
                }
            }
            StyledText { anchors.centerIn: parent; visible: root.items.length===0; text:"A little breathing room."; font.pixelSize: 13; color: Appearance.colors.colSubtext }
        }
        StyledText { visible: root.errorText!==""; text: root.errorText; wrapMode: Text.Wrap; Layout.fillWidth: true; color: Appearance.colors.colSubtext; font.pixelSize: 11 }
        RowLayout {
            Layout.fillWidth: true
            TextField { id: input; Layout.fillWidth: true; placeholderText: root.kind==="todo"?"What’s on your mind?":"Movie or TV title…"; maximumLength: 500; onAccepted: {if(text.trim()&&!write.running){root.mutate({action:"add",kind:root.kind,title:text.trim()});text="";}} }
            Button { text:"+"; enabled: input.text.trim().length>0&&!write.running; onClicked: {root.mutate({action:"add",kind:root.kind,title:input.text.trim()});input.text="";} }
        }
        StyledText { text: (root.state.outbox||[]).length?`${root.state.outbox.length} changes waiting to sync`:"Saved on this device"; color: Appearance.colors.colSubtext; font.pixelSize: 10 }
    }
}
