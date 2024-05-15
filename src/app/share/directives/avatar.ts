import {
  Directive,
  Input,
  HostBinding,
  OnChanges,
  SimpleChanges,
} from '@angular/core';

const avatarList = [
  '/assets/images/avatars/avatar_1.png',
  '/assets/images/avatars/avatar_2.png',
  '/assets/images/avatars/avatar_3.png',
  '/assets/images/avatars/avatar_4.png',
  '/assets/images/avatars/avatar_5.png',
  '/assets/images/avatars/avatar_6.png',
  '/assets/images/avatars/avatar_7.png',
  '/assets/images/avatars/avatar_8.png',
  '/assets/images/avatars/avatar_9.png',
  '/assets/images/avatars/avatar_10.png',
];

@Directive({
  selector: 'img[avatar]',
})
export class AvatarDirective implements OnChanges {
  @Input() public avatar: string;
  @HostBinding('src') src: string;
  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes.avatar &&
      changes.avatar.currentValue != changes.avatar.previousValue
    ) {
      let key = changes.avatar.currentValue as string;
      if (key && key.length) {
        key = key.toLowerCase();
        this.src =
          avatarList[key.charCodeAt(key.length - 1) % avatarList.length];
      }
    }
  }
}
