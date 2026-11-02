param([Parameter(Mandatory=$true)][int]$MatrixProcessId,[ValidateSet('wechat','bilibili','douyin')][string]$Platform,[ValidateSet('inspect','refresh','retry','details','stage','open-account','show-official','hide-official','more')][string]$Action='inspect')
# Normal Windows accessibility only, scoped to one original authorized test row.
# Never read field values, enable debugging, inject scripts or confirm submission.
$ErrorActionPreference='Stop'
$matrixProcess=Get-Process -Id $MatrixProcessId
if ([IO.Path]::GetDirectoryName($matrixProcess.Path) -ne 'D:\Program Files\fullstack-nestjs-template') { throw 'Unexpected app process' }
if ($Action -eq 'retry' -and $Platform -ne 'wechat') { throw 'Only the known unsubmitted Wechat test can be retried' }
Add-Type -AssemblyName Accessibility,UIAutomationClient,UIAutomationTypes
Add-Type -ReferencedAssemblies Accessibility -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Accessibility;
public static class MatrixTaskAccessible {
  delegate bool EnumProc(IntPtr handle,IntPtr arg);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent,EnumProc callback,IntPtr arg);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr handle,System.Text.StringBuilder text,int count);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr handle,out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr handle);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr handle);
  public static IntPtr Renderer(IntPtr parent,uint owner){
    var matches=new List<IntPtr>();
    EnumChildWindows(parent,(handle,arg)=>{uint pid;GetWindowThreadProcessId(handle,out pid);var name=new System.Text.StringBuilder(100);GetClassName(handle,name,100);if(pid==owner&&GetParent(handle)==parent&&IsWindowVisible(handle)&&name.ToString()=="Chrome_RenderWidgetHostHWND")matches.Add(handle);return true;},IntPtr.Zero);
    if(matches.Count!=1)throw new InvalidOperationException("No unique owned visible main renderer");
    return matches[0];
  }
  [DllImport("oleacc.dll")] static extern int AccessibleObjectFromWindow(IntPtr hwnd,uint objectId,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out IAccessible accessible);
  [DllImport("oleacc.dll")] static extern int AccessibleChildren(IAccessible root,int start,int count,[Out,MarshalAs(UnmanagedType.LPArray,SizeParamIndex=2)]object[] children,out int obtained);
  static bool Safe(IAccessible n){return (Convert.ToInt32(n.get_accState(0))&0x20018001)==0;}
  static List<IAccessible> Children(IAccessible n){
    var result=new List<IAccessible>();int count=Math.Min(n.accChildCount,400),obtained;
    if(count<=0)return result;var entries=new object[count];
    if(AccessibleChildren(n,0,count,entries,out obtained)<0)return result;
    for(int i=0;i<obtained;i++){var c=entries[i] as IAccessible;if(c!=null)result.Add(c);}
    return result;
  }
  static HashSet<string> Names(IAccessible n){
    var names=new HashSet<string>();var stack=new Stack<IAccessible>();stack.Push(n);int visited=0;
    while(stack.Count>0&&visited++<350){var item=stack.Pop();try{if(!Safe(item))continue;var name=item.get_accName(0);if(!String.IsNullOrEmpty(name)&&name.Length<800)names.Add(name);foreach(var c in Children(item))stack.Push(c);}catch(COMException){}}
    return names;
  }
  public static object Act(IntPtr hwnd,string platform,string action){
    string owner=platform=="wechat"?"\u7399\u5d8b":platform=="bilibili"?"sky\u8086\u5b87":"Siyu\u8086";
    string logo=platform=="wechat"?"\u89c6\u9891\u53f7 Logo":platform=="bilibili"?"B\u7ad9 Logo":"\u6296\u97f3 Logo";
    string id=platform=="wechat"?"9dc8f2c0":platform=="bilibili"?"ee475f64":"7a3111ca";
    string title="\u8584\u808c\u91cd\u542f\u8ba1\u5212\u7b2c\u5341\u4e8c\u5929\u00b7\u81ea\u6d4b1826";
    string label=action=="refresh"?"\u5237\u65b0\u72b6\u6001":action=="retry"?"\u91cd\u53d1":action=="more"?"\u66f4\u591a\u2304":action=="show-official"?"\u67e5\u770b\u5b98\u65b9\u9875\u9762":"\u67e5\u770b\u4efb\u52a1\u8be6\u60c5 "+title;
    Guid iid=new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");IAccessible root;
    if(AccessibleObjectFromWindow(hwnd,0xFFFFFFFC,ref iid,out root)!=0||root==null)throw new InvalidOperationException("App document unavailable");
    var matches=new List<IAccessible>();HashSet<string> rowNames=null;var stack=new Stack<IAccessible>();stack.Push(root);int visited=0;
    while(stack.Count>0&&visited++<2500){var node=stack.Pop();try{
      if(!Safe(node))continue;
      string nodeName=node.get_accName(0)??"";
      if(action=="hide-official"&&Convert.ToInt32(node.get_accRole(0))==43&&nodeName=="\u6536\u8d77\uff0c\u7ee7\u7eed\u5176\u4ed6\u64cd\u4f5c"){
        var panel=node;for(int d=0;panel!=null&&d<5;d++,panel=panel.accParent as IAccessible){var labels=Names(panel);if(labels.Contains(owner)&&labels.Contains(" \u00b7 \u53d1\u5e03\u4efb\u52a1\u9875\u9762")){matches.Add(node);rowNames=labels;break;}}
      }
      if(action=="open-account"&&Convert.ToInt32(node.get_accRole(0))==43&&nodeName.StartsWith(owner+"\u8d26\u53f7\u5934\u50cf "+logo+" ")&&nodeName.EndsWith(" "+owner+" "+logo.Replace(" Logo",""))){matches.Add(node);rowNames=Names(node);}
      if(Convert.ToInt32(node.get_accRole(0))==43&&(action=="stage"?node.get_accName(0).StartsWith("\u6267\u884c\u5230\u7684\u9636\u6bb5\uff1a"):node.get_accName(0)==label)){
        if(action=="open-account")continue;
        var parent=node;
        for(int depth=0;parent!=null&&depth<6;depth++,parent=parent.accParent as IAccessible){
          var names=Names(parent);
          if(!names.Contains(owner)||!names.Contains(logo)||!names.Contains(id)||!names.Contains(title))continue;
          int logos=0;foreach(var name in names)if(name=="\u89c6\u9891\u53f7 Logo"||name=="B\u7ad9 Logo"||name=="\u5c0f\u7ea2\u4e66 Logo"||name=="\u6296\u97f3 Logo")logos++;
          if(logos!=1)break;
          // This one attention/preparation attempt was separately inspected in
          // its read-only original-task sheet: navigation timeout, no upload or
          // submission. The same retained guest then visibly showed its bound
          // owner homepage. Do not generalize this exception to other attempts.
          bool inspectedNavigationTimeout=names.Contains("\u5f85\u8865\u5168 / \u9a8c\u8bc1")&&names.Contains("\u51c6\u5907\u8d26\u53f7\u9875\u9762")&&names.Contains("2026/10/17 16:21:45");
          if(action=="retry"&&((!names.Contains("\u53d1\u5e03\u5931\u8d25")||!names.Contains("\u672a\u63d0\u4ea4\u5230\u5e73\u53f0"))&&!inspectedNavigationTimeout||names.Contains("\u7b49\u5f85\u5e73\u53f0\u7ed3\u679c")||names.Contains("\u53d1\u5e03\u6210\u529f")))throw new InvalidOperationException("Original row is not explicitly unsubmitted");
          if(action=="refresh"&&!names.Contains("\u7b49\u5f85\u5e73\u53f0\u7ed3\u679c"))throw new InvalidOperationException("Original row has no uncertain result");
          matches.Add(node);rowNames=names;break;
        }
      }
      foreach(var c in Children(node))stack.Push(c);
    }catch(COMException){}}
    if(matches.Count!=1)throw new InvalidOperationException("No unique visible authorized task action: "+matches.Count);
    if(action!="inspect")matches[0].accDoDefaultAction(0);
    return new {platform,action,matched=1,invoked=action!="inspect",valuesRead=false,row=rowNames};
  }
}
'@
$matrixRenderer=[MatrixTaskAccessible]::Renderer($matrixProcess.MainWindowHandle,[uint32]$MatrixProcessId)
[MatrixTaskAccessible]::Act($matrixRenderer,$Platform,$Action) | ConvertTo-Json -Compress -Depth 3
