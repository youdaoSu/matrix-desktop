param([Parameter(Mandatory=$true)][int]$MatrixProcessId,[ValidateSet('read','accounts','publish','records')][string]$Action='read')
# Standard Windows MSAA accessibility, read-only and confined to Matrix.
# Never read accValue/passwords, inject code, or enable debugging. Optional
# default actions are restricted to three normal Matrix navigation links.
$ErrorActionPreference='Stop'
$matrixProcess=Get-Process -Id $MatrixProcessId
if ([IO.Path]::GetDirectoryName($matrixProcess.Path) -ne 'D:\Program Files\fullstack-nestjs-template') { throw 'Not installed Matrix' }
Add-Type -AssemblyName Accessibility,UIAutomationClient,UIAutomationTypes
Add-Type -ReferencedAssemblies Accessibility -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Accessibility;
public static class MatrixAccessibleRead {
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
  public static void Navigate(IntPtr hwnd,string name){
    if(name!="\u8d26\u53f7\u7ba1\u7406"&&name!="\u4e00\u952e\u53d1\u5e03"&&name!="\u4efb\u52a1\u8bb0\u5f55")throw new InvalidOperationException("Only normal app navigation is allowed");
    Guid iid=new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");IAccessible root;
    if(AccessibleObjectFromWindow(hwnd,0xFFFFFFFC,ref iid,out root)!=0||root==null)throw new InvalidOperationException("No app document");
    var matches=new List<IAccessible>();var stack=new Stack<IAccessible>();stack.Push(root);int visited=0;
    while(stack.Count>0&&visited++<2000){var node=stack.Pop();try{
      int state=Convert.ToInt32(node.get_accState(0)),role=Convert.ToInt32(node.get_accRole(0));
      if((state&0x20018001)!=0)continue;
      if((role==30||role==43||role==37)&&node.get_accName(0)==name)matches.Add(node);
      int count=Math.Min(node.accChildCount,300),obtained;var children=new object[count];
      if(count>0&&AccessibleChildren(node,0,count,children,out obtained)>=0)for(int i=0;i<obtained;i++){var child=children[i] as IAccessible;if(child!=null)stack.Push(child);}
    }catch(COMException){}}
    if(matches.Count!=1)throw new InvalidOperationException("No unique app navigation link");
    matches[0].accDoDefaultAction(0);
  }
  public static object Read(IntPtr hwnd) {
    Guid iid=new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");IAccessible root;
    int result=AccessibleObjectFromWindow(hwnd,0xFFFFFFFC,ref iid,out root);
    if(result!=0||root==null)throw new InvalidOperationException("Window has no standard MSAA document");
    var rows=new List<object>();var stack=new Stack<Tuple<IAccessible,int>>();stack.Push(Tuple.Create(root,0));int visited=0;
    while(stack.Count>0&&rows.Count<180&&visited++<2000){
      var node=stack.Pop();if(node.Item2>40)continue;
      try {
        int state=Convert.ToInt32(node.Item1.get_accState(0));
        if((state&0x20000000)!=0||(state&0x18000)!=0)continue;
        string name=node.Item1.get_accName(0);
        if(!String.IsNullOrEmpty(name)&&name.Length<=200)rows.Add(new{name,role=Convert.ToInt32(node.Item1.get_accRole(0)),depth=node.Item2});
        int count=Math.Min(node.Item1.accChildCount,300);if(count<=0)continue;
        var children=new object[count];int obtained;
        if(AccessibleChildren(node.Item1,0,count,children,out obtained)<0)continue;
        for(int i=obtained-1;i>=0;i--){
          var child=children[i] as IAccessible;
          if(child!=null)stack.Push(Tuple.Create(child,node.Item2+1));
          else if(children[i] is int){
            int childId=(int)children[i],childState=Convert.ToInt32(node.Item1.get_accState(childId));
            if((childState&0x20018000)!=0)continue;
            string childName=node.Item1.get_accName(childId);
            if(!String.IsNullOrEmpty(childName)&&childName.Length<=200)rows.Add(new{name=childName,role=Convert.ToInt32(node.Item1.get_accRole(childId)),depth=node.Item2+1});
          }
        }
      } catch(COMException){}catch(InvalidCastException){}
    }
    return new {rootState=root.get_accState(0),rootChildCount=root.accChildCount,visited,rows=rows.ToArray()};
  }
}
'@
$matrixRenderer=[MatrixAccessibleRead]::Renderer($matrixProcess.MainWindowHandle,[uint32]$MatrixProcessId)
if ($Action -ne 'read') {
  $matrixNames=@{accounts='\u8d26\u53f7\u7ba1\u7406';publish='\u4e00\u952e\u53d1\u5e03';records='\u4efb\u52a1\u8bb0\u5f55'}
  [MatrixAccessibleRead]::Navigate($matrixRenderer,[regex]::Unescape($matrixNames[$Action]))
  Start-Sleep -Milliseconds 500
}
$matrixRows=[MatrixAccessibleRead]::Read($matrixRenderer)
[pscustomobject]@{processId=$MatrixProcessId;readOnly=$true;credentialValuesRead=$false;controls=$matrixRows} | ConvertTo-Json -Compress -Depth 4
