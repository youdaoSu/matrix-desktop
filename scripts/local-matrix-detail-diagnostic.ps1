param([Parameter(Mandatory=$true)][int]$MatrixProcessId,[ValidateSet('read','read-all','scroll','focus-diagnostic','expand','close')][string]$Action='read')
# Normal Windows accessibility and scrolling of the original Wechat task sheet.
# No field values, credentials, official page actions or browser debugging.
$ErrorActionPreference='Stop'
$matrixProcess=Get-Process -Id $MatrixProcessId
if([IO.Path]::GetDirectoryName($matrixProcess.Path) -ne 'D:\Program Files\fullstack-nestjs-template'){throw 'Unexpected installed app'}
Add-Type -AssemblyName Accessibility
Add-Type -ReferencedAssemblies Accessibility -TypeDefinition @'
using System;using System.Collections.Generic;using System.Runtime.InteropServices;using Accessibility;
public static class MatrixDetailDiagnostic {
 delegate bool EnumProc(IntPtr handle,IntPtr arg);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent,EnumProc callback,IntPtr arg);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,System.Text.StringBuilder t,int c);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 [DllImport("oleacc.dll")] static extern int AccessibleObjectFromWindow(IntPtr h,uint id,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out IAccessible a);
 [DllImport("oleacc.dll")] static extern int AccessibleChildren(IAccessible a,int start,int count,[Out,MarshalAs(UnmanagedType.LPArray,SizeParamIndex=2)]object[] children,out int obtained);
 static List<IAccessible> Children(IAccessible a){var list=new List<IAccessible>();int n=Math.Min(a.accChildCount,400),got;var items=new object[n];if(n>0&&AccessibleChildren(a,0,n,items,out got)>=0)for(int i=0;i<got;i++){var c=items[i] as IAccessible;if(c!=null)list.Add(c);}return list;}
 static bool Safe(IAccessible a){return (Convert.ToInt32(a.get_accState(0))&0x20018001)==0;}
 public static object Run(IntPtr main,uint pid,string action){
  var renderers=new List<IntPtr>();EnumChildWindows(main,(h,arg)=>{uint p;GetWindowThreadProcessId(h,out p);var text=new System.Text.StringBuilder(100);GetClassName(h,text,100);if(p==pid&&GetParent(h)==main&&IsWindowVisible(h)&&text.ToString()=="Chrome_RenderWidgetHostHWND")renderers.Add(h);return true;},IntPtr.Zero);
  if(renderers.Count!=1)throw new Exception("No unique visible owned document");
  Guid iid=new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");IAccessible root;if(AccessibleObjectFromWindow(renderers[0],0xFFFFFFFC,ref iid,out root)!=0||root==null)throw new Exception("No task document");
  var stack=new Stack<IAccessible>();stack.Push(root);var dialogs=new List<IAccessible>();int visited=0;
  while(stack.Count>0&&visited++<2000){var a=stack.Pop();try{if(!Safe(a))continue;if(Convert.ToInt32(a.get_accRole(0))==18&&a.get_accName(0)=="\u4efb\u52a1\u8be6\u60c5")dialogs.Add(a);foreach(var c in Children(a))stack.Push(c);}catch(COMException){}}
  if(dialogs.Count!=1)throw new Exception("No unique visible task detail");
  var names=new List<string>();var targets=new List<IAccessible>();bool owner=false,platform=false,original=false;stack.Push(dialogs[0]);visited=0;
  while(stack.Count>0&&visited++<1800){var a=stack.Pop();try{if((Convert.ToInt32(a.get_accState(0))&0x20008001)!=0)continue;bool shown=Safe(a);string name=a.get_accName(0)??"";int role=Convert.ToInt32(a.get_accRole(0));if(role!=42&&name=="\u7399\u5d8b")owner=true;if(role!=42&&name=="\u89c6\u9891\u53f7 Logo")platform=true;if(role!=42&&name.Contains("90ff089c-40e9-407c-9fdb-c3b3b001db23"))original=true;if(shown&&name.Length>0&&name.Length<=700&&role!=42)names.Add(name);if((shown||action=="focus-diagnostic")&&role==43&&name==(action=="close"?"Close":"\u517c\u5bb9\u6027\u8bca\u65ad\uff08\u53ea\u8bfb\u63a7\u4ef6\u4fe1\u606f\uff09"))targets.Add(a);foreach(var c in Children(a))stack.Push(c);}catch(COMException){}}
  // The account header can scroll above the viewport. The task ID is rendered
  // in the middle of the same read-only sheet and remains an exact ownership check.
  if(!(owner&&platform)&&!original)throw new Exception("Original Wechat task ownership not visible");
  if(action=="scroll"){
   int l,t,w,h;dialogs[0].accLocation(out l,out t,out w,out h,0);if(w<300||h<300)throw new Exception("Task sheet bounds unavailable");int x=l+w/2,y=t+h/2;
   SendMessage(renderers[0],0x020A,new IntPtr(-600<<16),new IntPtr((y<<16)|(x&0xffff)));
  }else if(action=="focus-diagnostic"){if(targets.Count!=1)throw new Exception("No unique task diagnostic summary");targets[0].accSelect(1,0);}
  else if(action=="expand"||action=="close"){if(targets.Count!=1)throw new Exception("No unique visible task detail control");targets[0].accDoDefaultAction(0);}
  if(action=="read-all"){
   names.Clear();stack.Push(dialogs[0]);visited=0;
   // Offscreen, non-hidden static labels in this exact task sheet are readable
   // through normal accessibility. Never read text-input roles or accValue.
   while(stack.Count>0&&visited++<1800&&names.Count<260){var a=stack.Pop();try{if((Convert.ToInt32(a.get_accState(0))&0x20008001)!=0)continue;string name=a.get_accName(0)??"";int role=Convert.ToInt32(a.get_accRole(0));if(role!=42&&name.Length>0&&name.Length<=700)names.Add(name);foreach(var c in Children(a))stack.Push(c);}catch(COMException){}}
  }
  return new {action,valuesRead=false,originalTask=original,visibleLabels=names};
 }
}
'@
[MatrixDetailDiagnostic]::Run($matrixProcess.MainWindowHandle,[uint32]$MatrixProcessId,$Action)|ConvertTo-Json -Compress -Depth 3
